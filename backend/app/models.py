from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider_call_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(String(64), default="CALL_STARTED")
    trade: Mapped[str | None] = mapped_column(String(32), nullable=True)
    issue_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location: Mapped[str | None] = mapped_column(String(128), nullable=True)
    zip: Mapped[str | None] = mapped_column(String(16), nullable=True)
    urgency: Mapped[str] = mapped_column(String(32), default="routine")
    callback_confirmed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    preferred_next_action: Mapped[str | None] = mapped_column(String(128), nullable=True)
    disposition: Mapped[str | None] = mapped_column(String(64), nullable=True)
    handoff_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    handoff_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    scenario: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_assistant_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    events: Mapped[list["CallEvent"]] = relationship(back_populates="call", cascade="all, delete-orphan")
    receipt: Mapped["Receipt | None"] = relationship(back_populates="call", uselist=False, cascade="all, delete-orphan")


class CallEvent(Base):
    __tablename__ = "call_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True)

    call: Mapped[Call] = relationship(back_populates="events")


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    call_id: Mapped[str] = mapped_column(ForeignKey("calls.id"), unique=True, index=True)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    call: Mapped[Call] = relationship(back_populates="receipt")
