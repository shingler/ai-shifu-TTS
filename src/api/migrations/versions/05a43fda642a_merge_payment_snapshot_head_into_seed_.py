"""merge payment snapshot head into seed v2.2.5

Revision ID: 05a43fda642a
Revises: a7c4e9f1b2d3, b94bcfd5c398
Create Date: 2026-07-28 07:34:58.317842

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '05a43fda642a'
down_revision = ('a7c4e9f1b2d3', 'b94bcfd5c398')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
