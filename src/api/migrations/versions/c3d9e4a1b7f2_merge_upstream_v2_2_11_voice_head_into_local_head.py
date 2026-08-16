"""merge upstream v2.2.11 voice head into local head

Revision ID: c3d9e4a1b7f2
Revises: 05a43fda642a, e7b3c9d1f5a2
Create Date: 2026-08-16 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3d9e4a1b7f2'
down_revision = ('05a43fda642a', 'e7b3c9d1f5a2')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
