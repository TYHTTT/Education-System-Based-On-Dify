import re
from enum import Enum

from pydantic_core import core_schema

UUID_ID_PATTERN = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
# Legacy identifiers remain valid for existing records and seed imports.
COURSE_ID_PATTERN = rf"(?:{UUID_ID_PATTERN}|[a-z][a-z0-9_]{{1,63}})"
TOPIC_ID_PATTERN = rf"^(?:{UUID_ID_PATTERN}|[a-z][a-z0-9_]*)\.[a-z0-9_]+$"


class Course(str, Enum):
    MACHINE_LEARNING = "machine_learning"
    ADVANCED_MATHEMATICS = "advanced_mathematics"
    LINEAR_ALGEBRA = "linear_algebra"
    PROBABILITY_STATISTICS = "probability_statistics"

    def __str__(self):
        return self.value

    @classmethod
    def _missing_(cls, value):
        if not isinstance(value, str) or not re.fullmatch(COURSE_ID_PATTERN, value):
            return None
        member = str.__new__(cls, value)
        member._name_ = value
        member._value_ = value
        return member

    @classmethod
    def __get_pydantic_core_schema__(cls, source, handler):
        # Course IDs are database records; the four enum members remain seed constants.
        return core_schema.no_info_after_validator_function(
            cls, core_schema.str_schema(pattern=rf"^{COURSE_ID_PATTERN}$")
        )

    @property
    def display_name(self) -> str:
        return {
            self.MACHINE_LEARNING: "机器学习",
            self.ADVANCED_MATHEMATICS: "高等数学",
            self.LINEAR_ALGEBRA: "线性代数",
            self.PROBABILITY_STATISTICS: "概率论与统计基础",
        }.get(self, self.value)
