"""merge upstream v2.3.4 head into local head

Revision ID: a8f3c2d9e1b4
Revises: d4e6f8a2c1b9, fde432bceab4
Create Date: 2026-10-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a8f3c2d9e1b4'
down_revision = ('d4e6f8a2c1b9', 'fde432bceab4')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
