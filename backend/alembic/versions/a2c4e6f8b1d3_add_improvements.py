"""add urgency quick_replies preferences tone generation_metadata

Revision ID: a2c4e6f8b1d3
Revises: 8b7dca3777c1
Create Date: 2026-10-02 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = 'a2c4e6f8b1d3'
down_revision: Union[str, Sequence[str], None] = '8b7dca3777c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users.preferences
    op.add_column('users', sa.Column('preferences', JSONB(), nullable=True, server_default='{}'))

    # emails.urgency  emails.quick_replies
    op.add_column('emails', sa.Column('urgency', sa.String(), nullable=True))
    op.add_column('emails', sa.Column('quick_replies', JSONB(), nullable=True))

    # ai_responses.tone  ai_responses.generation_metadata
    op.add_column('ai_responses', sa.Column('tone', sa.String(), nullable=True))
    op.add_column('ai_responses', sa.Column('generation_metadata', JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('ai_responses', 'generation_metadata')
    op.drop_column('ai_responses', 'tone')
    op.drop_column('emails', 'quick_replies')
    op.drop_column('emails', 'urgency')
    op.drop_column('users', 'preferences')
