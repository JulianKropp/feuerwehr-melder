from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text
from typing import Optional

from ....db.sql import models
from . import schemas

async def ensure_options_schema(db: AsyncSession) -> None:
    """Ensure the options table has the columns we expect (simple SQLite migration)."""
    try:
        res = await db.execute(text("PRAGMA table_info(options)"))
        cols = [r[1] for r in res.fetchall()]  # (cid, name, type, ...)
        statements = []
        if 'speech_language' not in cols:
            statements.append("ALTER TABLE options ADD COLUMN speech_language TEXT NOT NULL DEFAULT 'de-DE'")
        if 'weather_location' not in cols:
            statements.append("ALTER TABLE options ADD COLUMN weather_location TEXT NOT NULL DEFAULT ''")
        for stmt in statements:
            await db.execute(text(stmt))
        if statements:
            await db.commit()
    except Exception:
        # Best-effort: ignore if not SQLite or no permission; backend will fallback to defaults
        pass

async def get_options(db: AsyncSession) -> models.Options:
    await ensure_options_schema(db)
    result = await db.execute(select(models.Options).limit(1))
    opts = result.scalars().first()
    return opts

async def ensure_default_options(db: AsyncSession) -> models.Options:
    await ensure_options_schema(db)
    opts = await get_options(db)
    if opts is None:
        opts = models.Options()
        db.add(opts)
        await db.commit()
        await db.refresh(opts)
    return opts

async def update_options(db: AsyncSession, update: schemas.OptionsUpdate) -> models.Options:
    await ensure_options_schema(db)
    opts = await ensure_default_options(db)
    data = update.dict(exclude_unset=True)
    for k, v in data.items():
        setattr(opts, k, v)
    await db.commit()
    await db.refresh(opts)
    return opts
