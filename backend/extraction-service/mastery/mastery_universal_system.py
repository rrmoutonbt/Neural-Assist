"""
Local implementation of the Mastery Universal System module.
Provides regex-based NLP entity extraction from deal documents
as a drop-in replacement for the external Mastery engine.
"""

import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Known controlled values (mirrors core/models.py) ──
ENTITY_OWNERS = ["Banc Of El", "Divinus Arbor Capital", "Adam Earth Equities", "OneMind"]
FACILITATORS = ["Ishmael", "Melvin", "Ray El"]
MODELS = ["Private", "JV", "Commercial"]


class MasteryMode(Enum):
    ANALYZE = "ANALYZE"
    EXTRACT = "EXTRACT"
    FULL = "FULL"


@dataclass
class MasteryConfig:
    mode: MasteryMode = MasteryMode.ANALYZE
    enable_cognitive_network: bool = True
    enable_swarm_processing: bool = True
    swarm_nodes: int = 100
    enable_claas: bool = True
    enable_license_validation: bool = True
    max_parallel_operations: int = 4
    cache_enabled: bool = True
    audit_logging: bool = True


@dataclass
class MasteryResult:
    success: bool = True
    data: Dict[str, Any] = field(default_factory=dict)


class MasteryEngine:
    """Regex-based entity extraction engine for deal documents."""

    def __init__(self, config: MasteryConfig):
        self._config = config
        self._session_id = ""
        logger.info(f"MasteryEngine initialized (mode={config.mode.value})")

    def activate(self) -> dict:
        self._session_id = f"mastery-{uuid.uuid4().hex[:12]}"
        logger.info(f"MasteryEngine activated: session={self._session_id}")
        return {"success": True, "session_id": self._session_id}

    def recognize_and_replace(self, text: str, recognize_only: bool = True) -> MasteryResult:
        """Extract entities from document text using pattern matching."""
        if not text or not text.strip():
            return MasteryResult(success=False, data={"entities": {}, "statistics": {}})

        entities = {
            "dates": self._extract_dates(text),
            "percentages": self._extract_percentages(text),
            "names": self._extract_names(text),
            "organizations": self._extract_organizations(text),
            "jurisdictions": self._extract_jurisdictions(text),
            "monetary_values": self._extract_monetary(text),
            "deal_models": self._extract_models(text),
            "entity_owners": self._extract_entity_owners(text),
            "facilitators": self._extract_facilitators(text),
            "relationships": self._extract_relationships(text),
            "summaries": self._extract_summaries(text),
            "voting_notes": self._extract_voting(text),
            "partner_notes": self._extract_partner_notes(text),
        }

        total = sum(len(v) for v in entities.values())
        stats = {
            "total_replacements": total,
            "entity_types_found": sum(1 for v in entities.values() if v),
            "mode": self._config.mode.value,
            "session_id": self._session_id,
        }

        logger.info(f"Extraction complete: {total} entities across {stats['entity_types_found']} types")
        return MasteryResult(success=True, data={"entities": entities, "statistics": stats})

    def _extract_dates(self, text: str) -> List[str]:
        patterns = [
            r'\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b',
            r'\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b',
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
            r'\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b',
            r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[.\s]+\d{1,2},?\s+\d{4}\b',
        ]
        results = []
        for p in patterns:
            results.extend(re.findall(p, text, re.IGNORECASE))
        return list(dict.fromkeys(results))

    def _extract_percentages(self, text: str) -> List[str]:
        return list(dict.fromkeys(re.findall(r'\b\d+(?:\.\d+)?%', text)))

    def _extract_names(self, text: str) -> List[str]:
        names = []
        # Find "Mr./Ms./Dr. Name" patterns
        formal = re.findall(r'\b(?:Mr|Ms|Mrs|Dr|Col)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?', text)
        names.extend(formal)
        return list(dict.fromkeys(names))

    def _extract_organizations(self, text: str) -> List[str]:
        orgs = []
        # Check for known entity owners first
        for owner in ENTITY_OWNERS:
            if re.search(re.escape(owner), text, re.IGNORECASE):
                orgs.append(owner)
        # Common org patterns: "XYZ Corp/Inc/LLC/Ltd/Trust/Capital/Group/Partners"
        corp_pattern = re.findall(
            r'\b[A-Z][A-Za-z&]+(?:\s+[A-Z][A-Za-z&]+)*\s+(?:Corp(?:oration)?|Inc(?:orporated)?|LLC|Ltd|Trust|Capital|'
            r'Group|Partners|Equities|Holdings|Ventures|Fund|Associates|International|'
            r'Investments|Securities|Management|Advisory|Advisors|Financial|Solutions)',
            text
        )
        orgs.extend([o.strip() for o in corp_pattern if len(o.strip()) > 3])
        return list(dict.fromkeys(orgs))

    def _extract_jurisdictions(self, text: str) -> List[str]:
        jurisdictions = [
            "Delaware", "New York", "California", "Texas", "Florida", "Nevada",
            "Wyoming", "Illinois", "Georgia", "Virginia", "Washington",
            "Cayman Islands", "British Virgin Islands", "Bermuda", "Singapore",
            "Hong Kong", "Luxembourg", "Ireland", "United Kingdom", "Switzerland",
            "State of Delaware", "State of New York", "State of California",
        ]
        found = []
        for j in jurisdictions:
            if re.search(r'\b' + re.escape(j) + r'\b', text, re.IGNORECASE):
                found.append(j)
        return list(dict.fromkeys(found))

    def _extract_monetary(self, text: str) -> List[str]:
        return list(dict.fromkeys(re.findall(
            r'\$[\d,]+(?:\.\d{1,2})?(?:\s*(?:million|billion|M|B|K|thousand))?',
            text, re.IGNORECASE
        )))

    def _extract_models(self, text: str) -> List[str]:
        found = []
        for model in MODELS:
            patterns = [
                r'\b' + re.escape(model) + r'\s+(?:model|deal|structure|arrangement|agreement|venture)',
                r'(?:model|deal|structure|type|arrangement)[\s:]+' + re.escape(model),
            ]
            for p in patterns:
                if re.search(p, text, re.IGNORECASE):
                    found.append(model)
                    break
        return list(dict.fromkeys(found))

    def _extract_entity_owners(self, text: str) -> List[str]:
        found = []
        for owner in ENTITY_OWNERS:
            if re.search(re.escape(owner), text, re.IGNORECASE):
                found.append(owner)
        return found

    def _extract_facilitators(self, text: str) -> List[str]:
        found = []
        for f in FACILITATORS:
            if re.search(r'\b' + re.escape(f) + r'\b', text, re.IGNORECASE):
                found.append(f)
        return found

    def _extract_relationships(self, text: str) -> List[str]:
        patterns = [
            r'(?:relationship|relation|connection|affiliation|partnership)[\s:]+([^\n.;]{5,80})',
            r'(?:in\s+(?:partnership|collaboration|association)\s+with)\s+([^\n.;]{5,80})',
        ]
        results = []
        for p in patterns:
            results.extend(re.findall(p, text, re.IGNORECASE))
        return [r.strip() for r in results[:3]]

    def _extract_summaries(self, text: str) -> List[str]:
        patterns = [
            r'(?:summary|overview|description|abstract|purpose)[\s:]+([^\n]{20,300})',
            r'(?:this\s+(?:deal|agreement|arrangement|transaction)\s+(?:is|involves|concerns|relates\s+to))\s+([^\n]{15,250})',
        ]
        results = []
        for p in patterns:
            results.extend(re.findall(p, text, re.IGNORECASE))
        # If no explicit summary found, use first substantial paragraph
        if not results:
            paragraphs = [p.strip() for p in text.split('\n\n') if len(p.strip()) > 50]
            if paragraphs:
                results.append(paragraphs[0][:300])
        return [r.strip() for r in results[:2]]

    def _extract_voting(self, text: str) -> List[str]:
        patterns = [
            r'(?:voting|vote|outlier|dissent|minority)[\s:]+([^\n]{10,200})',
        ]
        results = []
        for p in patterns:
            results.extend(re.findall(p, text, re.IGNORECASE))
        return [r.strip() for r in results[:2]]

    def _extract_partner_notes(self, text: str) -> List[str]:
        patterns = [
            r'(?:partner\s+notes?|notes?\s+on\s+partner|additional\s+notes?)[\s:]+([^\n]{10,300})',
            r'(?:note|remark|observation)[\s:]+([^\n]{10,200})',
        ]
        results = []
        for p in patterns:
            results.extend(re.findall(p, text, re.IGNORECASE))
        return [r.strip() for r in results[:3]]
