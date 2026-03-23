"""Seed script: create default admin and agent users."""
import uuid
from passlib.context import CryptContext
from app.database import sync_session_factory
from app.models.user import User
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed():
    db = sync_session_factory()
    try:
        # Create agent user (fixed UUID for system use)
        agent_id = uuid.UUID(settings.AGENT_USER_ID)
        agent = db.query(User).filter(User.id == agent_id).first()
        if not agent:
            agent = User(
                id=agent_id,
                username="agent",
                email="agent@system.local",
                password_hash=pwd_context.hash("not-a-real-password"),
                display_name="AI Assistant",
                role="agent",
            )
            db.add(agent)
            print("Created agent user")

        # Create default admin user
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@diary.local",
                password_hash=pwd_context.hash("admin123"),
                display_name="Admin",
                role="admin",
            )
            db.add(admin)
            print("Created admin user (password: admin123)")

        db.commit()
        print("Seed completed.")
    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
