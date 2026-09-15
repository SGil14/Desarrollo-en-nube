"""Modelos Pydantic para validar los cuerpos de las peticiones.

Los campos de fecha se tipan como `date` (no `str`): Pydantic ya convierte el
string ISO que manda el frontend a un `datetime.date` real, que es lo que
`asyncpg` necesita para bindear una columna DATE (a diferencia de node-postgres,
no acepta strings sueltos ahi).
"""
from datetime import date as Date
from typing import Literal, Optional

from pydantic import BaseModel, Field

TransactionType = Literal["income", "expense", "transfer"]


class TransactionIn(BaseModel):
    type: TransactionType
    amount: float = Field(gt=0)
    category: str
    description: Optional[str] = ""
    date: Date
    accountId: Optional[str] = None


class TransactionUpdate(BaseModel):
    type: Optional[TransactionType] = None
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    description: Optional[str] = None
    date: Optional[Date] = None
    accountId: Optional[str] = None


class BulkItem(BaseModel):
    type: TransactionType
    amount: float = Field(gt=0)
    category: str
    description: Optional[str] = ""
    date: Date
    accountId: Optional[str] = None


class TransactionsBulkIn(BaseModel):
    items: list[BulkItem]
    accountId: Optional[str] = None


class AccountIn(BaseModel):
    name: str
    kind: str = "banco"
    startingBalance: float = 0


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    startingBalance: Optional[float] = None


class BudgetIn(BaseModel):
    limit: float = Field(gt=0)


class GoalIn(BaseModel):
    name: str
    target: float = Field(gt=0)
    current: float = 0
    targetDate: Optional[Date] = None


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target: Optional[float] = Field(default=None, gt=0)
    current: Optional[float] = None
    targetDate: Optional[Date] = None


class DebtIn(BaseModel):
    name: str
    kind: Literal["debt", "account"] = "debt"
    balance: float
    dueDay: Optional[int] = None
    minPayment: Optional[float] = 0
    rate: Optional[float] = 0


class DebtUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[Literal["debt", "account"]] = None
    balance: Optional[float] = None
    dueDay: Optional[int] = None
    minPayment: Optional[float] = None
    rate: Optional[float] = None
    lastPaymentDate: Optional[Date] = None


class CategoryRuleIn(BaseModel):
    keyword: str
    category: str


class SettingsUpdate(BaseModel):
    currency: Optional[str] = None
    expenseCategories: Optional[list[str]] = None
    incomeCategories: Optional[list[str]] = None
    isExample: Optional[bool] = None
