import os
from datetime import timedelta

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'mpchat-secret-key-2024'
    
    # Neon PostgreSQL connection - try different variations
    SQLALCHEMY_DATABASE_URI = 'postgresql://neondb_owner:npg_kyF8rYX4bpqS@ep-empty-forest-a4zrreai-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
    # Alternative connection string without channel_binding
    # SQLALCHEMY_DATABASE_URI = 'postgresql://neondb_owner:npg_p1OTQWcmk9Ej@ep-delicate-wave-adrntqeo-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_recycle': 300,
        'pool_pre_ping': True,
        'connect_args': {
            'sslmode': 'require',
            'options': '-c timezone=utc'
        }
    }
    
    # Session configuration
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)