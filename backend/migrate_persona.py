import os
import sys

# Ensure backend directory is in python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, inspect, text
from app.core.config import settings

def migrate():
    db_url = settings.DATABASE_URL
    print(f"Connecting to database url: {db_url}")
    
    try:
        engine = create_engine(db_url)
        inspector = inspect(engine)
        
        # Check if table exists
        if 'job_postings' not in inspector.get_table_names():
            print("Table 'job_postings' does not exist yet. It will be created on application startup.")
            return
            
        columns = [col['name'] for col in inspector.get_columns('job_postings')]
        
        if 'interviewer_persona' not in columns:
            print("Adding 'interviewer_persona' column to 'job_postings' table...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE job_postings ADD COLUMN interviewer_persona VARCHAR(50) DEFAULT 'standard'"))
                # Commit connection
                conn.commit()
            print("Migration completed successfully!")
        else:
            print("Column 'interviewer_persona' already exists in 'job_postings'. No migration needed.")
            
    except Exception as e:
        print(f"Error executing migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    migrate()
