from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite+aiosqlite:///./feuerwehr.db"

engine = create_async_engine(DATABASE_URL, echo=True)

AsyncSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
    class_=AsyncSession,
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # After ensuring tables exist, make sure new columns are present (simple SQLite migration)
    await ensure_incident_columns()

async def ensure_incident_columns():
    """Ensure newly added columns exist on the incidents table for SQLite.
    This is a lightweight migration helper to avoid breaking existing dev DBs.
    """
    async with engine.begin() as conn:
        # Check existing columns
        pragma = await conn.exec_driver_sql("PRAGMA table_info('incidents')")
        rows = pragma.fetchall()
        existing = {row[1] for row in rows}  # row[1] is the column name

        statements = []
        if 'address' not in existing:
            statements.append("ALTER TABLE incidents ADD COLUMN address TEXT NOT NULL DEFAULT ''")
        if 'latitude' not in existing:
            statements.append("ALTER TABLE incidents ADD COLUMN latitude REAL")
        if 'longitude' not in existing:
            statements.append("ALTER TABLE incidents ADD COLUMN longitude REAL")
        if 'scheduled_at' not in existing:
            statements.append("ALTER TABLE incidents ADD COLUMN scheduled_at DATETIME")

        for stmt in statements:
            await conn.exec_driver_sql(stmt)
