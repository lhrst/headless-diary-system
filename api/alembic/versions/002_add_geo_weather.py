"""Add geo-location and weather fields to diary_entries

Revision ID: 002
Revises: 001
Create Date: 2026-03-24
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("diary_entries", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("diary_entries", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("diary_entries", sa.Column("address", sa.String(500), nullable=True))
    op.add_column("diary_entries", sa.Column("weather", sa.String(100), nullable=True))
    op.add_column("diary_entries", sa.Column("weather_icon", sa.String(20), nullable=True))
    op.add_column("diary_entries", sa.Column("temperature", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("diary_entries", "temperature")
    op.drop_column("diary_entries", "weather_icon")
    op.drop_column("diary_entries", "weather")
    op.drop_column("diary_entries", "address")
    op.drop_column("diary_entries", "longitude")
    op.drop_column("diary_entries", "latitude")
