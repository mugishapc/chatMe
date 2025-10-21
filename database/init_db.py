import sys
import os

# Add the parent directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, db
from models import User

def init_db():
    with app.app_context():
        try:
            # Create all tables
            print("Creating database tables...")
            db.create_all()
            print("Tables created successfully!")
            
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
                print("Admin user created: mpc")
            else:
                print("Admin user already exists")
            
            print("Database initialized successfully!")
            
        except Exception as e:
            print(f"Error initializing database: {e}")
            db.session.rollback()

if __name__ == '__main__':
    init_db()