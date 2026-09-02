"""merge upstream v2.2.12 billing head into local head

Revision ID: d4e6f8a2c1b9
Revises: c3d9e4a1b7f2, c7b9e1a2d4f6
Create Date: 2026-09-02 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e6f8a2c1b9'
down_revision = ('c3d9e4a1b7f2', 'c7b9e1a2d4f6')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
