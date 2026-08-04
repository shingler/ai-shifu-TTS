"""
Shifu discovery functions

Public/semi-public helpers that power the homepage course discovery feed.
The catalog returns published shifus to anonymous visitors and additionally
decorates them with ownership/purchase/progress badges for logged-in users.

Author: ai-shifu
Date: 2026-06-24
"""

from __future__ import annotations

import math
from typing import Optional

from flask import Flask

from flaskr.dao import db
from flaskr.service.common.dtos import PageNationDTO
from flaskr.service.learn.models import LearnProgressRecord
from flaskr.service.order.consts import (
    LEARN_STATUS_COMPLETED,
    LEARN_STATUS_IN_PROGRESS,
    LEARN_STATUS_RESET,
    ORDER_STATUS_SUCCESS,
)
from flaskr.service.order.models import Order
from flaskr.service.shifu.consts import UNIT_TYPE_VALUE_GUEST
from flaskr.service.shifu.models import (
    PublishedOutlineItem,
    PublishedShifu,
    ShifuUserArchive,
)
from flaskr.service.shifu.utils import get_shifu_res_url_dict


def get_published_course_catalog(
    app: Flask,
    user_id: Optional[str],
    page_index: int,
    page_size: int,
) -> PageNationDTO:
    """
    Build a paginated catalog of published courses for the homepage feed.

    Visibility:
      - Anonymous / no user: only non-archived courses.
      - Logged-in user: non-archived courses plus archived courses that the
        user owns (creator) or has purchased.

    Ordering: non-archived first, archived last; within each group, by
    ``updated_at`` descending.

    Badges (``is_owner`` / ``is_purchased`` / ``learn_status``) are populated
    only when ``user_id`` is provided.
    """
    page_index = max(1, int(page_index or 1))
    page_size = max(1, int(page_size or 10))

    with app.app_context():
        courses = (
            PublishedShifu.query.filter(PublishedShifu.deleted == 0)
            .order_by(PublishedShifu.updated_at.desc())
            .all()
        )

        archive_map = _load_creator_archive_map(courses)
        purchased_set = _load_purchased_set(user_id) if user_id else set()

        def _visible(course: PublishedShifu) -> bool:
            archived = archive_map.get(course.shifu_bid, False)
            if not archived:
                return True
            if not user_id:
                return False
            return (
                course.created_user_bid == user_id
                or course.shifu_bid in purchased_set
            )

        visible = [c for c in courses if _visible(c)]

        # Stable sort keeps the updated_at-desc order within each archive group.
        visible.sort(key=lambda c: 1 if archive_map.get(c.shifu_bid, False) else 0)

        total = len(visible)
        page_count = math.ceil(total / page_size) if page_size > 0 else 0
        safe_page = min(page_index, max(page_count, 1))
        offset = (safe_page - 1) * page_size
        page_items = visible[offset : offset + page_size]

        res_url_map = get_shifu_res_url_dict([c.avatar_res_bid for c in page_items])
        progress_map = (
            _load_progress_map(user_id, [c.shifu_bid for c in page_items])
            if user_id
            else {}
        )

        data = [
            {
                "shifu_bid": c.shifu_bid,
                "title": c.title,
                "description": c.description,
                "avatar_url": res_url_map.get(c.avatar_res_bid, ""),
                "price": str(c.price),
                "tts_enabled": bool(c.tts_enabled),
                "updated_at": c.updated_at,
                "is_archived": bool(archive_map.get(c.shifu_bid, False)),
                "is_owner": c.created_user_bid == user_id if user_id else False,
                "is_purchased": c.shifu_bid in purchased_set if user_id else False,
                "learn_status": progress_map.get(c.shifu_bid),
            }
            for c in page_items
        ]

        return PageNationDTO(safe_page, page_size, total, data)


def _load_creator_archive_map(courses: list[PublishedShifu]) -> dict[str, bool]:
    """
    Course-level archive state derived from each creator's own archive record.

    The system stores archive state per (user, shifu). We treat the creator's
    record (``ShifuUserArchive(shifu_bid, user_bid=created_user_bid)``) as the
    course-level archived flag.
    """
    if not courses:
        return {}
    bids = [c.shifu_bid for c in courses]
    creator_of = {c.shifu_bid: c.created_user_bid for c in courses}
    rows = (
        ShifuUserArchive.query.filter(
            ShifuUserArchive.shifu_bid.in_(bids),
            ShifuUserArchive.archived == 1,
        )
        .all()
    )
    return {
        row.shifu_bid: True
        for row in rows
        if row.user_bid and row.user_bid == creator_of.get(row.shifu_bid)
    }


def _load_purchased_set(user_id: str) -> set[str]:
    rows = (
        db.session.query(Order.shifu_bid)
        .filter(
            Order.user_bid == user_id,
            Order.status == ORDER_STATUS_SUCCESS,
            Order.deleted == 0,
        )
        .all()
    )
    return {row[0] for row in rows}


def _load_progress_map(user_id: str, shifu_bids: list[str]) -> dict[str, int]:
    """
    Aggregate per-course learn status for the visible page items.

    Completion is decided against the full set of leaf lessons taken from the
    published outline, NOT against whatever progress rows happen to exist.
    Container (section/root) placeholder rows are ignored entirely: their
    status is flipped by a recursive walker that is unreliable (it both flips
    early and misses flips), so they must not gate completion. LEARN_STATUS_RESET
    rows are also ignored (reset does not soft-delete).

    Rules:
      - every leaf lesson completed -> LEARN_STATUS_COMPLETED
      - any leaf lesson touched but not all done -> LEARN_STATUS_IN_PROGRESS
      - otherwise omitted (None)
    """
    if not shifu_bids:
        return {}
    # Leaf lessons (type != GUEST container) per shifu, from the published outline.
    leaf_bids_per_shifu: dict[str, set[str]] = {}
    for shifu_bid, outline_item_bid in db.session.query(
        PublishedOutlineItem.shifu_bid,
        PublishedOutlineItem.outline_item_bid,
    ).filter(
        PublishedOutlineItem.shifu_bid.in_(shifu_bids),
        PublishedOutlineItem.deleted == 0,
        PublishedOutlineItem.type != UNIT_TYPE_VALUE_GUEST,
    ):
        leaf_bids_per_shifu.setdefault(shifu_bid, set()).add(outline_item_bid)

    completed: dict[str, set[str]] = {}
    touched: dict[str, set[str]] = {}
    for row in LearnProgressRecord.query.filter(
        LearnProgressRecord.user_bid == user_id,
        LearnProgressRecord.shifu_bid.in_(shifu_bids),
        LearnProgressRecord.deleted == 0,
        LearnProgressRecord.status != LEARN_STATUS_RESET,
    ):
        leaf_set = leaf_bids_per_shifu.get(row.shifu_bid)
        if not leaf_set or row.outline_item_bid not in leaf_set:
            continue  # container placeholder or unknown outline -> ignore
        touched.setdefault(row.shifu_bid, set()).add(row.outline_item_bid)
        if row.status == LEARN_STATUS_COMPLETED:
            completed.setdefault(row.shifu_bid, set()).add(row.outline_item_bid)

    result: dict[str, int] = {}
    for bid, leaf_set in leaf_bids_per_shifu.items():
        if not leaf_set:
            continue
        if completed.get(bid, set()) == leaf_set:
            result[bid] = LEARN_STATUS_COMPLETED
        elif touched.get(bid):
            result[bid] = LEARN_STATUS_IN_PROGRESS
    return result
