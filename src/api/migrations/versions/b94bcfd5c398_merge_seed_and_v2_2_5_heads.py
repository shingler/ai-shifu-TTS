"""merge seed and v2.2.5 heads

Revision ID: b94bcfd5c398
Revises: 6f6b5b40a411, d4e5f6a7b8c9
Create Date: 2026-07-07 03:33:52.139017

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b94bcfd5c398'
down_revision = ('6f6b5b40a411', 'd4e5f6a7b8c9')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
