from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite+aiosqlite:///./data/feuerwehr.db"

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
    await ensure_vehicle_status_integer()

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

async def ensure_vehicle_status_integer():
    """Ensure vehicles.status is an INTEGER with allowed values {1,2,3,4,6}.
    If an old schema exists with string enum + CHECK constraint, rebuild the table safely and migrate data.
    """
    async with engine.begin() as conn:
        pragma = await conn.exec_driver_sql("PRAGMA table_info('vehicles')")
        rows = pragma.fetchall()
        cols = {row[1]: row[2].lower() if row[2] else '' for row in rows}  # name -> declared type

        # If table doesn't exist yet, nothing to do (create_all will create it with INTEGER via models)
        if not rows:
            return

        declared = cols.get('status', '')
        if declared in ("integer", "int", "smallint"):
            # Ensure values are valid integers
            await conn.exec_driver_sql(
                "UPDATE vehicles SET status = 1 WHERE typeof(status) != 'integer' OR status NOT IN (1,2,3,4,6)"
            )
            return

        # Rebuild table to enforce INTEGER status and preserve data
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        # Create new table with desired schema
        await conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS vehicles_new (
                id INTEGER PRIMARY KEY,
                name VARCHAR NOT NULL UNIQUE,
                status INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        # Migrate data: any non-integer or invalid value becomes 1 (no string-specific mapping)
        await conn.exec_driver_sql(
            """
            INSERT OR IGNORE INTO vehicles_new (id, name, status)
            SELECT id,
                   name,
                   CASE
                       WHEN typeof(status)='integer' AND status IN (1,2,3,4,6) THEN status
                       ELSE 1
                   END AS status
            FROM vehicles
            """
        )
        # Replace old table
        await conn.exec_driver_sql("DROP TABLE vehicles")
        await conn.exec_driver_sql("ALTER TABLE vehicles_new RENAME TO vehicles")
        await conn.exec_driver_sql("PRAGMA foreign_keys=ON")
