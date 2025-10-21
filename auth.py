from flask import Blueprint, request, jsonify, session
from models import db, User
import re

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
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

@auth_bp.route('/login', methods=['POST'])
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

@auth_bp.route('/logout', methods=['POST'])
def logout():
    try:
        user_id = session.get('user_id')
        
        if user_id:
            # Update user status
            user = User.query.get(user_id)
            if user:
                user.is_online = False
                db.session.commit()
        
        # Clear session
        session.clear()
        
        return jsonify({'success': True, 'message': 'Logout successful'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Logout failed: {str(e)}'}), 500

@auth_bp.route('/check-auth', methods=['GET'])
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

@auth_bp.route('/users', methods=['GET'])
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