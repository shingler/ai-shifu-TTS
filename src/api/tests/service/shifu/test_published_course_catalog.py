from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest

import flaskr.dao as dao
from flaskr.service.learn.models import LearnProgressRecord
from flaskr.service.order.consts import (
    LEARN_STATUS_COMPLETED,
    LEARN_STATUS_IN_PROGRESS,
    ORDER_STATUS_SUCCESS,
)
from flaskr.service.order.models import Order
from flaskr.service.shifu.discovery_funcs import get_published_course_catalog
from flaskr.service.shifu.models import PublishedShifu, ShifuUserArchive

_PREFIX = "disc-"


def _cleanup_all(app) -> None:
    """Remove any leftover discovery fixtures so session-scoped db stays clean."""
    like = _PREFIX + "%"
    with app.app_context():
        for model in (PublishedShifu, ShifuUserArchive, Order, LearnProgressRecord):
            model.query.filter(model.shifu_bid.like(like)).delete(
                synchronize_session=False
            )
        dao.db.session.commit()


def _seed_published(
    app,
    *,
    shifu_bid: str,
    owner_bid: str,
    title: str = "T",
    updated_at: datetime | None = None,
    deleted: int = 0,
    price: Decimal = Decimal("0"),
) -> None:
    moment = updated_at or datetime(2026, 5, 1, 10, 0, 0)
    with app.app_context():
        dao.db.session.add(
            PublishedShifu(
                shifu_bid=shifu_bid,
                title=title,
                description="desc",
                avatar_res_bid="",
                price=price,
                deleted=deleted,
                created_user_bid=owner_bid,
                created_at=moment,
                updated_at=moment,
                updated_user_bid=owner_bid,
            )
        )
        dao.db.session.commit()


def _seed_archive(app, shifu_bid: str, user_bid: str) -> None:
    moment = datetime(2026, 5, 2, 10, 0, 0)
    with app.app_context():
        dao.db.session.add(
            ShifuUserArchive(
                shifu_bid=shifu_bid,
                user_bid=user_bid,
                archived=1,
                archived_at=moment,
                created_at=moment,
                updated_at=moment,
            )
        )
        dao.db.session.commit()


def _seed_order(app, user_bid: str, shifu_bid: str, status: int = ORDER_STATUS_SUCCESS) -> None:
    with app.app_context():
        dao.db.session.add(
            Order(
                order_bid=f"o-{user_bid}-{shifu_bid}",
                shifu_bid=shifu_bid,
                user_bid=user_bid,
                status=status,
            )
        )
        dao.db.session.commit()


def _seed_progress(
    app,
    user_bid: str,
    shifu_bid: str,
    outline_item_bid: str,
    status: int,
) -> None:
    with app.app_context():
        dao.db.session.add(
            LearnProgressRecord(
                progress_record_bid=f"p-{user_bid}-{shifu_bid}-{outline_item_bid}",
                shifu_bid=shifu_bid,
                outline_item_bid=outline_item_bid,
                user_bid=user_bid,
                status=status,
            )
        )
        dao.db.session.commit()


def test_anonymous_only_sees_non_archived(app):
    bids = [_PREFIX + "anon-1", _PREFIX + "anon-2", _PREFIX + "anon-arch"]
    _cleanup_all(app)
    _seed_published(app, shifu_bid=bids[0], owner_bid="owner-A")
    _seed_published(app, shifu_bid=bids[1], owner_bid="owner-B")
    _seed_published(app, shifu_bid=bids[2], owner_bid="owner-C")
    _seed_archive(app, bids[2], "owner-C")  # creator archived -> course-level archived

    result = get_published_course_catalog(app, None, 1, 10)

    seen = {item["shifu_bid"] for item in result.data}
    assert seen == {bids[0], bids[1]}
    assert bids[2] not in seen
    # Anonymous requests carry no badges.
    for item in result.data:
        assert item["is_owner"] is False
        assert item["is_purchased"] is False
        assert item["learn_status"] is None
        assert item["is_archived"] is False


def test_logged_in_sees_owned_and_purchased_archived(app):
    user = "user-L"
    own_arch = _PREFIX + "L-own-arch"
    bought_arch = _PREFIX + "L-bought-arch"
    other_arch = _PREFIX + "L-other-arch"
    normal = _PREFIX + "L-normal"
    _cleanup_all(app)

    _seed_published(app, shifu_bid=own_arch, owner_bid=user)
    _seed_archive(app, own_arch, user)

    _seed_published(app, shifu_bid=bought_arch, owner_bid="creator-B")
    _seed_archive(app, bought_arch, "creator-B")
    _seed_order(app, user, bought_arch)

    _seed_published(app, shifu_bid=other_arch, owner_bid="creator-C")
    _seed_archive(app, other_arch, "creator-C")

    _seed_published(app, shifu_bid=normal, owner_bid="creator-D")

    result = get_published_course_catalog(app, user, 1, 10)

    seen = {item["shifu_bid"] for item in result.data}
    assert own_arch in seen
    assert bought_arch in seen
    assert normal in seen
    assert other_arch not in seen


def test_archived_sorted_last(app):
    user = "user-S"
    not_arch = _PREFIX + "S-notarch"
    arch = _PREFIX + "S-arch"
    _cleanup_all(app)
    _seed_published(
        app,
        shifu_bid=not_arch,
        owner_bid="owner-X",
        updated_at=datetime(2026, 5, 10, 10, 0, 0),
    )
    _seed_published(
        app,
        shifu_bid=arch,
        owner_bid=user,
        updated_at=datetime(2026, 5, 15, 10, 0, 0),
    )
    _seed_archive(app, arch, user)

    result = get_published_course_catalog(app, user, 1, 10)

    seen = [item["shifu_bid"] for item in result.data]
    # Non-archived first even though the archived course is more recently updated.
    assert seen == [not_arch, arch]


def test_badges_owner_priority_and_progress(app):
    user = "user-B"
    own = _PREFIX + "B-own"
    bought_ip = _PREFIX + "B-bought-ip"
    bought_done = _PREFIX + "B-bought-done"
    _cleanup_all(app)

    _seed_published(app, shifu_bid=own, owner_bid=user)
    _seed_order(app, user, own)

    _seed_published(app, shifu_bid=bought_ip, owner_bid="creator-IP")
    _seed_order(app, user, bought_ip)
    _seed_progress(app, user, bought_ip, "o1", LEARN_STATUS_IN_PROGRESS)

    _seed_published(app, shifu_bid=bought_done, owner_bid="creator-DONE")
    _seed_order(app, user, bought_done)
    _seed_progress(app, user, bought_done, "o1", LEARN_STATUS_COMPLETED)
    _seed_progress(app, user, bought_done, "o2", LEARN_STATUS_COMPLETED)

    result = get_published_course_catalog(app, user, 1, 10)

    by = {item["shifu_bid"]: item for item in result.data}
    # Owner takes priority over purchased (both true on the wire; front-end renders owner only).
    assert by[own]["is_owner"] is True
    assert by[own]["is_purchased"] is True
    assert by[bought_ip]["is_owner"] is False
    assert by[bought_ip]["is_purchased"] is True
    assert by[bought_ip]["learn_status"] == LEARN_STATUS_IN_PROGRESS
    assert by[bought_done]["learn_status"] == LEARN_STATUS_COMPLETED


def test_pagination(app):
    bids = [_PREFIX + f"P-{i}" for i in range(3)]
    _cleanup_all(app)
    for i, bid in enumerate(bids):
        _seed_published(app, shifu_bid=bid, owner_bid=f"owner-P{i}")

    page1 = get_published_course_catalog(app, None, 1, 2)
    assert len(page1.data) == 2
    assert page1.total == 3
    assert page1.page_count == 2

    page2 = get_published_course_catalog(app, None, 2, 2)
    assert len(page2.data) == 1


def test_deleted_excluded(app):
    live = _PREFIX + "D-live"
    gone = _PREFIX + "D-gone"
    _cleanup_all(app)
    _seed_published(app, shifu_bid=live, owner_bid="owner-D1")
    _seed_published(app, shifu_bid=gone, owner_bid="owner-D2", deleted=1)

    result = get_published_course_catalog(app, None, 1, 10)

    seen = {item["shifu_bid"] for item in result.data}
    assert live in seen
    assert gone not in seen


def test_route_anonymous_ok(test_client, app):
    bid = _PREFIX + "R-anon"
    _cleanup_all(app)
    _seed_published(app, shifu_bid=bid, owner_bid="owner-R")

    resp = test_client.get("/api/shifu/published-courses?page_index=1&page_size=10")
    payload = resp.get_json(force=True)

    assert resp.status_code == 200
    assert payload["code"] == 0
    assert any(i["shifu_bid"] == bid for i in payload["data"]["items"])


def test_route_with_token_attaches_user(test_client, app, monkeypatch):
    user = "user-R2"
    bid = _PREFIX + "R-owned"
    _cleanup_all(app)
    _seed_published(app, shifu_bid=bid, owner_bid=user)

    monkeypatch.setattr(
        "flaskr.route.user.validate_user",
        lambda _app, _token: SimpleNamespace(
            user_id=user, is_creator=True, is_operator=False, language="en-US"
        ),
        raising=False,
    )

    resp = test_client.get(
        "/api/shifu/published-courses?page_index=1&page_size=10",
        headers={"Token": "test-token"},
    )
    payload = resp.get_json(force=True)

    assert resp.status_code == 200
    assert payload["code"] == 0
    item = next(i for i in payload["data"]["items"] if i["shifu_bid"] == bid)
    assert item["is_owner"] is True
