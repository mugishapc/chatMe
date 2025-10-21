from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import uuid

db = SQLAlchemy()

def generate_uuid():
    return str(uuid.uuid4())

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    display_name = db.Column(db.String(100), nullable=False)
    avatar = db.Column(db.String(200), default='default_avatar.png')
    is_online = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    sent_messages = db.relationship('Message', foreign_keys='Message.sender_id', backref='sender', lazy='dynamic', cascade='all, delete-orphan')
    chat_participations = db.relationship('ChatParticipant', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    calls_made = db.relationship('Call', foreign_keys='Call.caller_id', backref='caller', lazy='dynamic')
    calls_received = db.relationship('Call', foreign_keys='Call.receiver_id', backref='receiver', lazy='dynamic')

class Chat(db.Model):
    __tablename__ = 'chats'
    
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    is_group = db.Column(db.Boolean, default=False)
    group_name = db.Column(db.String(100))
    group_avatar = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_message_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    participants = db.relationship('ChatParticipant', backref='chat', lazy='dynamic', cascade='all, delete-orphan')
    messages = db.relationship('Message', backref='chat', lazy='dynamic', cascade='all, delete-orphan')

class ChatParticipant(db.Model):
    __tablename__ = 'chat_participants'
    
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    chat_id = db.Column(db.String(36), db.ForeignKey('chats.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_admin = db.Column(db.Boolean, default=False)
    
    # Unique constraint
    __table_args__ = (db.UniqueConstraint('chat_id', 'user_id', name='unique_chat_participant'),)

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    chat_id = db.Column(db.String(36), db.ForeignKey('chats.id', ondelete='CASCADE'), nullable=False)
    sender_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    message_type = db.Column(db.String(20), default='text')  # text, image, video, audio
    file_path = db.Column(db.String(200))
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    
    # Reply functionality
    reply_to_id = db.Column(db.String(36), db.ForeignKey('messages.id'))
    replies = db.relationship('Message', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')

class Call(db.Model):
    __tablename__ = 'calls'
    
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    caller_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    call_type = db.Column(db.String(10), default='voice')  # voice, video
    status = db.Column(db.String(20), default='calling')  # calling, ongoing, completed, missed, rejected
    started_at = db.Column(db.DateTime, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime)
    duration = db.Column(db.Integer)  # in seconds

class UserSession(db.Model):
    __tablename__ = 'user_sessions'
    
    id = db.Column(db.String(36), primary_key=True, default=generate_uuid)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False)
    socket_id = db.Column(db.String(100))
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_activity = db.Column(db.DateTime, default=datetime.utcnow)