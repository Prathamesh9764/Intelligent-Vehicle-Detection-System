"""
Create the first admin user for the speed_ocr database.

Usage:
    python seed_admin.py <username> <password>

If no arguments are given, defaults to admin / admin123 (change immediately after first login).
"""
import sys

from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def main():
    username = sys.argv[1] if len(sys.argv) > 1 else "admin"
    password = sys.argv[2] if len(sys.argv) > 2 else "admin123"

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            print(f"User '{username}' already exists.")
            return
        user = User(username=username, password=hash_password(password), role="admin", is_active=True)
        db.add(user)
        db.commit()
        print(f"Created admin user '{username}' with password '{password}'.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
