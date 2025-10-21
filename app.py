from flask import Flask, render_template, request, jsonify, session
from flask_socketio import SocketIO, emit, join_room, leave_room
from models import db, User, Chat, ChatParticipant, Message, Call
from config import Config
from datetime import datetime
import uuid

app = Flask(__name__)
app.config.from_object(Config)

# Initialize extensions
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", manage_session=False)

# Store active connections
active_connections = {}

def initialize_database():
    """Initialize database and create admin user"""
    with app.app_context():
        try:
            print("Creating database tables...")
            db.create_all()
            print("✅ Database tables created successfully!")
            
            # Create admin user if not exists
            admin = User.query.filter_by(username='mpc').first()
            if not admin:
                admin = User(
                    username='mpc',
                    display_name='MpChat Admin',
                    is_admin=True
                )
                db.session.add(admin)
                db.session.commit()
                print("✅ Admin user 'mpc' created successfully!")
            else:
                print("✅ Admin user already exists")
                
        except Exception as e:
            print(f"❌ Error initializing database: {e}")
            import traceback
            traceback.print_exc()

@app.route('/')
def index():
    if 'user_id' not in session:
        return render_template('login.html')
    return render_template('chat.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/register')
def register_page():
    return render_template('register.html')

# Auth routes
@app.route('/auth/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        username = data.get('username', '').strip().lower()
        display_name = data.get('display_name', '').strip()
        
        if not username or not display_name:
            return jsonify({'success': False, 'message': 'All fields are required'}), 400
        
        if len(username) < 3 or len(username) > 20:
            return jsonify({'success': False, 'message': 'Username must be between 3 and 20 characters'}), 400
        
        # Check if username exists
        if User.query.filter_by(username=username).first():
            return jsonify({'success': False, 'message': 'Username already exists'}), 400
        
        # Create user
        is_admin = (username == 'mpc')
        user = User(
            username=username,
            display_name=display_name,
            is_admin=is_admin
        )
        
        db.session.add(user)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Registration successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'display_name': user.display_name,
                'is_admin': user.is_admin
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Registration failed: {str(e)}'}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username', '').strip().lower()
        
        if not username:
            return jsonify({'success': False, 'message': 'Username is required'}), 400
        
        # Find user or create if doesn't exist (for demo)
        user = User.query.filter_by(username=username).first()
        if not user:
            is_admin = (username == 'mpc')
            user = User(
                username=username,
                display_name=username.capitalize(),
                is_admin=is_admin
            )
            db.session.add(user)
        
        # Update user status
        user.is_online = True
        user.last_seen = datetime.utcnow()
        db.session.commit()
        
        # Store user in session
        session['user_id'] = user.id
        session['username'] = user.username
        session['display_name'] = user.display_name
        session['is_admin'] = user.is_admin
        session.permanent = True
        
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user': {
                'id': user.id,
                'username': user.username,
                'display_name': user.display_name,
                'is_admin': user.is_admin
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Login failed: {str(e)}'}), 500

@app.route('/auth/logout', methods=['POST'])
def logout():
    try:
        user_id = session.get('user_id')
        
        if user_id:
            # Update user status
            user = User.query.get(user_id)
            if user:
                user.is_online = False
                user.last_seen = datetime.utcnow()
                db.session.commit()
        
        # Clear session
        session.clear()
        
        return jsonify({'success': True, 'message': 'Logout successful'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Logout failed: {str(e)}'}), 500

@app.route('/auth/check-auth', methods=['GET'])
def check_auth():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            return jsonify({
                'authenticated': True,
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'display_name': user.display_name,
                    'is_admin': user.is_admin
                }
            }), 200
    
    return jsonify({'authenticated': False}), 200

@app.route('/auth/users', methods=['GET'])
def get_users():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    current_user_id = session['user_id']
    users = User.query.filter(User.id != current_user_id).all()
    
    user_list = []
    for user in users:
        user_list.append({
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name,
            'is_online': user.is_online,
            'last_seen': user.last_seen.isoformat() if user.last_seen else None,
            'is_admin': user.is_admin
        })
    
    return jsonify({'success': True, 'users': user_list}), 200

# Socket.IO events
@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on('authenticate')
def handle_authenticate(data):
    user_id = data.get('user_id')
    if not user_id:
        emit('authentication_failed', {'message': 'User ID required'})
        return False
    
    user = User.query.get(user_id)
    if not user:
        emit('authentication_failed', {'message': 'User not found'})
        return False
    
    # Store connection
    active_connections[user_id] = request.sid
    
    # Update user status
    user.is_online = True
    db.session.commit()
    
    # Notify other users
    emit('user_status_changed', {
        'user_id': user_id,
        'is_online': True,
        'username': user.username
    }, broadcast=True, include_self=False)
    
    emit('authentication_success', {
        'message': 'Authenticated successfully',
        'user': {
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name
        }
    })

@socketio.on('disconnect')
def handle_disconnect():
    user_id = None
    for uid, sid in active_connections.items():
        if sid == request.sid:
            user_id = uid
            break
    
    if user_id:
        del active_connections[user_id]
        
        # Update user status
        user = User.query.get(user_id)
        if user:
            user.is_online = False
            user.last_seen = datetime.utcnow()
            db.session.commit()
        
        # Notify other users
        emit('user_status_changed', {
            'user_id': user_id,
            'is_online': False,
            'username': user.username if user else 'Unknown'
        }, broadcast=True)

@socketio.on('start_chat')
def handle_start_chat(data):
    user1_id = data.get('current_user_id')
    user2_id = data.get('target_user_id')
    
    if not user1_id or not user2_id:
        emit('error', {'message': 'User IDs required'})
        return
    
    # Find existing chat between users
    chat = db.session.query(Chat).join(ChatParticipant).filter(
        ChatParticipant.user_id.in_([user1_id, user2_id]),
        Chat.is_group == False
    ).group_by(Chat.id).having(db.func.count(ChatParticipant.user_id) == 2).first()
    
    if not chat:
        # Create new chat
        chat = Chat(id=str(uuid.uuid4()))
        db.session.add(chat)
        db.session.flush()  # Get the ID without committing
        
        # Add participants
        participant1 = ChatParticipant(chat_id=chat.id, user_id=user1_id)
        participant2 = ChatParticipant(chat_id=chat.id, user_id=user2_id)
        db.session.add_all([participant1, participant2])
        db.session.commit()
    
    # Get chat history
    chat_messages = Message.query.filter_by(chat_id=chat.id).order_by(Message.created_at.asc()).all()
    
    # Get chat details
    other_user = User.query.get(user2_id)
    chat_data = {
        'chat_id': chat.id,
        'other_user': {
            'id': other_user.id,
            'username': other_user.username,
            'display_name': other_user.display_name,
            'is_online': other_user.is_online
        },
        'messages': [
            {
                'id': msg.id,
                'sender_id': msg.sender_id,
                'content': msg.content,
                'type': msg.message_type,
                'timestamp': msg.created_at.isoformat(),
                'is_read': msg.is_read
            }
            for msg in chat_messages
        ]
    }
    
    emit('chat_started', chat_data)

@socketio.on('join_chat')
def handle_join_chat(data):
    chat_id = data.get('chat_id')
    user_id = data.get('user_id')
    
    if chat_id and user_id:
        join_room(chat_id)
        emit('user_joined', {'user_id': user_id, 'chat_id': chat_id}, room=chat_id)

@socketio.on('send_message')
def handle_send_message(data):
    chat_id = data.get('chat_id')
    sender_id = data.get('sender_id')
    content = data.get('content')
    message_type = data.get('type', 'text')
    
    if not all([chat_id, sender_id, content]):
        emit('error', {'message': 'Missing required fields'})
        return
    
    # Create and save message to database
    message = Message(
        id=str(uuid.uuid4()),
        chat_id=chat_id,
        sender_id=sender_id,
        content=content,
        message_type=message_type
    )
    
    db.session.add(message)
    
    # Update chat's last message time
    chat = Chat.query.get(chat_id)
    if chat:
        chat.last_message_at = datetime.utcnow()
    
    db.session.commit()
    
    # Prepare message data for clients
    message_data = {
        'id': message.id,
        'chat_id': message.chat_id,
        'sender_id': message.sender_id,
        'content': message.content,
        'type': message.message_type,
        'timestamp': message.created_at.isoformat(),
        'is_read': message.is_read
    }
    
    # Send to chat room
    emit('new_message', message_data, room=chat_id)
    
    # Send notification to participants who are not in the chat
    participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
    for participant in participants:
        if (participant.user_id != sender_id and 
            participant.user_id in active_connections and
            participant.user_id not in socketio.server.rooms(chat_id)):
            
            emit('message_notification', {
                'chat_id': chat_id,
                'sender_id': sender_id,
                'content': content,
                'timestamp': message.created_at.isoformat()
            }, room=active_connections[participant.user_id])

@socketio.on('typing_start')
def handle_typing_start(data):
    chat_id = data.get('chat_id')
    user_id = data.get('user_id')
    
    if chat_id and user_id:
        user = User.query.get(user_id)
        emit('user_typing', {
            'user_id': user_id,
            'username': user.username,
            'typing': True
        }, room=chat_id, include_self=False)

@socketio.on('typing_stop')
def handle_typing_stop(data):
    chat_id = data.get('chat_id')
    user_id = data.get('user_id')
    
    if chat_id and user_id:
        emit('user_typing', {
            'user_id': user_id,
            'typing': False
        }, room=chat_id, include_self=False)

@socketio.on('initiate_call')
def handle_initiate_call(data):
    caller_id = data.get('caller_id')
    receiver_id = data.get('receiver_id')
    call_type = data.get('call_type', 'voice')
    
    if not all([caller_id, receiver_id]):
        emit('error', {'message': 'Caller and receiver IDs required'})
        return
    
    caller = User.query.get(caller_id)
    receiver = User.query.get(receiver_id)
    
    if not caller or not receiver:
        emit('error', {'message': 'User not found'})
        return
    
    # Create call record in database
    call = Call(
        id=str(uuid.uuid4()),
        caller_id=caller_id,
        receiver_id=receiver_id,
        call_type=call_type
    )
    db.session.add(call)
    db.session.commit()
    
    # Send call invitation to receiver
    if receiver_id in active_connections:
        emit('incoming_call', {
            'call_id': call.id,
            'caller': {
                'id': caller.id,
                'username': caller.username,
                'display_name': caller.display_name
            },
            'call_type': call_type
        }, room=active_connections[receiver_id])
    
    emit('call_initiated', {
        'call_id': call.id,
        'status': 'calling'
    })

@socketio.on('call_response')
def handle_call_response(data):
    call_id = data.get('call_id')
    user_id = data.get('user_id')
    accepted = data.get('accepted')
    
    call = Call.query.get(call_id)
    if not call:
        emit('error', {'message': 'Call not found'})
        return
    
    if accepted:
        call.status = 'ongoing'
        # Notify caller
        if call.caller_id in active_connections:
            emit('call_accepted', {
                'call_id': call_id,
                'accepted_by': user_id
            }, room=active_connections[call.caller_id])
    else:
        call.status = 'rejected'
        # Notify caller
        if call.caller_id in active_connections:
            emit('call_rejected', {
                'call_id': call_id,
                'rejected_by': user_id
            }, room=active_connections[call.caller_id])
    
    db.session.commit()

@socketio.on('end_call')
def handle_end_call(data):
    call_id = data.get('call_id')
    user_id = data.get('user_id')
    
    call = Call.query.get(call_id)
    if call:
        call.status = 'completed'
        call.ended_at = datetime.utcnow()
        if call.started_at:
            call.duration = int((call.ended_at - call.started_at).total_seconds())
        
        db.session.commit()
        
        # Notify other participant
        other_user_id = call.receiver_id if user_id == call.caller_id else call.caller_id
        if other_user_id in active_connections:
            emit('call_ended', {
                'call_id': call_id,
                'ended_by': user_id
            }, room=active_connections[other_user_id])

# Admin routes
@app.route('/admin/users', methods=['GET'])
def admin_get_users():
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    
    users = User.query.all()
    user_list = []
    for user in users:
        user_list.append({
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name,
            'is_online': user.is_online,
            'last_seen': user.last_seen.isoformat() if user.last_seen else None,
            'is_admin': user.is_admin,
            'created_at': user.created_at.isoformat() if user.created_at else None
        })
    
    return jsonify({'success': True, 'users': user_list})

@app.route('/admin/users/<user_id>', methods=['DELETE'])
def admin_delete_user(user_id):
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    
    if user_id == session['user_id']:
        return jsonify({'success': False, 'message': 'Cannot delete yourself'}), 400
    
    user = User.query.get(user_id)
    if not user:
        return jsonify({'success': False, 'message': 'User not found'}), 404
    
    try:
        # Delete user (cascade will handle related records)
        db.session.delete(user)
        db.session.commit()
        
        # Notify via Socket.IO if user is online
        if user_id in active_connections:
            emit('account_deleted', {'message': 'Your account has been deleted by admin'}, 
                 room=active_connections[user_id])
            del active_connections[user_id]
        
        return jsonify({'success': True, 'message': 'User deleted successfully'})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Failed to delete user: {str(e)}'}), 500

@app.route('/admin/chats', methods=['GET'])
def admin_get_chats():
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    
    chats = Chat.query.all()
    chat_list = []
    for chat in chats:
        participants = [p.user_id for p in chat.participants]
        message_count = Message.query.filter_by(chat_id=chat.id).count()
        
        chat_list.append({
            'id': chat.id,
            'is_group': chat.is_group,
            'group_name': chat.group_name,
            'participants': participants,
            'message_count': message_count,
            'created_at': chat.created_at.isoformat() if chat.created_at else None,
            'last_message_at': chat.last_message_at.isoformat() if chat.last_message_at else None
        })
    
    return jsonify({'success': True, 'chats': chat_list})

@app.route('/admin/chats/<chat_id>', methods=['DELETE'])
def admin_delete_chat(chat_id):
    if 'user_id' not in session or not session.get('is_admin'):
        return jsonify({'success': False, 'message': 'Unauthorized'}), 403
    
    chat = Chat.query.get(chat_id)
    if not chat:
        return jsonify({'success': False, 'message': 'Chat not found'}), 404
    
    try:
        # Get participant IDs for notification
        participant_ids = [p.user_id for p in chat.participants]
        
        # Delete chat (cascade will handle messages)
        db.session.delete(chat)
        db.session.commit()
        
        # Notify participants
        for user_id in participant_ids:
            if user_id in active_connections:
                emit('chat_deleted', {'chat_id': chat_id}, room=active_connections[user_id])
        
        return jsonify({'success': True, 'message': 'Chat deleted successfully'})
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Failed to delete chat: {str(e)}'}), 500

if __name__ == '__main__':
    initialize_database()
    print("🚀 MpChat server starting...")
    print("📊 Database: PostgreSQL (Neon)")
    print("🌐 Access the app at: http://localhost:5000")
    print("🔑 Admin login: username 'mpc'")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)