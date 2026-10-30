"""
label_auditor.py
----------------
Smart Food Label & Regulatory Safety Auditor.
Extracts label text, extracts MFG & EXP dates, computes remaining shelf life,
cross-references ingredients and additives (INS/E-numbers) against FSSAI/FDA norms,
detects allergens, and calculates a dynamic Regulatory Safety Index (0-100).
"""

from __future__ import annotations

import io
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from dateutil import parser as date_parser
from dateutil.relativedelta import relativedelta
from PIL import Image

logger = logging.getLogger("FoodLabelAuditor")
logger.setLevel(logging.INFO)

try:
    import pytesseract
    PYTESSERACT_AVAILABLE = True
except ImportError:
    PYTESSERACT_AVAILABLE = False
    logger.warning("pytesseract is not installed. Fallback rule extraction will operate on raw input.")


# --- Regulatory Safety Reference Dictionaries (FSSAI / FDA / EFSA) ---

HARMFUL_ADDITIVES: Dict[str, Dict[str, str]] = {
    # Synthetic Colors
    "E102": {"name": "Tartrazine", "category": "Synthetic Color", "risk": "High", "desc": "Allergenic, linked to hyperactivity in children (banned/restricted in EU/parts of Asia)"},
    "INS102": {"name": "Tartrazine", "category": "Synthetic Color", "risk": "High", "desc": "Allergenic, linked to hyperactivity"},
    "102": {"name": "Tartrazine", "category": "Synthetic Color", "risk": "High", "desc": "Synthetic azo dye"},
    "E110": {"name": "Sunset Yellow FCF", "category": "Synthetic Color", "risk": "High", "desc": "Associated with allergies and asthma"},
    "INS110": {"name": "Sunset Yellow FCF", "category": "Synthetic Color", "risk": "High", "desc": "Azo dye with potential hyperactivity flags"},
    "E122": {"name": "Carmoisine / Azorubine", "category": "Synthetic Color", "risk": "High", "desc": "Strictly regulated in Europe"},
    "INS122": {"name": "Carmoisine", "category": "Synthetic Color", "risk": "High", "desc": "Synthetic red azo dye"},
    "E124": {"name": "Ponceau 4R", "category": "Synthetic Color", "risk": "High", "desc": "Restricted synthetic colorant"},
    "INS124": {"name": "Ponceau 4R", "category": "Synthetic Color", "risk": "High", "desc": "Azo dye regulated by FSSAI"},
    "E129": {"name": "Allura Red AC", "category": "Synthetic Color", "risk": "Moderate", "desc": "Azo dye, skin reaction risk"},
    "INS129": {"name": "Allura Red AC", "category": "Synthetic Color", "risk": "Moderate", "desc": "Regulated red food dye"},
    "E133": {"name": "Brilliant Blue FCF", "category": "Synthetic Color", "risk": "Moderate", "desc": "Synthetic triarylmethane dye"},
    "INS133": {"name": "Brilliant Blue FCF", "category": "Synthetic Color", "risk": "Moderate", "desc": "Synthetic blue dye"},

    # Preservatives
    "E211": {"name": "Sodium Benzoate", "category": "Preservative", "risk": "High", "desc": "Forms carcinogenic benzene when combined with Vitamin C (ascorbic acid)"},
    "INS211": {"name": "Sodium Benzoate", "category": "Preservative", "risk": "High", "desc": "Common chemical preservative with benzene risk in acidic drinks"},
    "211": {"name": "Sodium Benzoate", "category": "Preservative", "risk": "High", "desc": "Preservative requiring strict upper limit compliance"},
    "E220": {"name": "Sulphur Dioxide", "category": "Preservative", "risk": "High", "desc": "Strong respiratory irritant, triggers acute asthmatic attacks"},
    "INS220": {"name": "Sulphur Dioxide", "category": "Preservative", "risk": "High", "desc": "Sulphite preservative / antioxidant"},
    "E221": {"name": "Sodium Sulphite", "category": "Preservative", "risk": "High", "desc": "Sulphite preservative; mandatory allergen labelling"},
    "INS221": {"name": "Sodium Sulphite", "category": "Preservative", "risk": "High", "desc": "Sulphite compound"},
    "E223": {"name": "Sodium Metabisulphite", "category": "Preservative", "risk": "High", "desc": "Sulphite-based antioxidant and antimicrobial"},
    "INS223": {"name": "Sodium Metabisulphite", "category": "Preservative", "risk": "High", "desc": "Sulphite risk for sensitive individuals"},
    "E249": {"name": "Potassium Nitrite", "category": "Curing Agent / Preservative", "risk": "High", "desc": "Nitrosamine precursor linked to colorectal concerns"},
    "E250": {"name": "Sodium Nitrite", "category": "Curing Agent / Preservative", "risk": "High", "desc": "Forms nitrosamines under high heat; regulated heavily by FDA/FSSAI"},
    "INS250": {"name": "Sodium Nitrite", "category": "Curing Agent / Preservative", "risk": "High", "desc": "Cured meat preservative"},
    "E251": {"name": "Sodium Nitrate", "category": "Curing Agent", "risk": "Moderate", "desc": "Regulated nitrate preservative"},
    "INS251": {"name": "Sodium Nitrate", "category": "Curing Agent", "risk": "Moderate", "desc": "Nitrate food additive"},
    "E282": {"name": "Calcium Propionate", "category": "Antimicrobial / Mold Inhibitor", "risk": "Moderate", "desc": "Common in bread; may cause headaches or sleep disturbances in sensitive kids"},
    "INS282": {"name": "Calcium Propionate", "category": "Antimicrobial", "risk": "Moderate", "desc": "Bakery mold inhibitor"},

    # Flavor Enhancers
    "E621": {"name": "Monosodium Glutamate (MSG)", "category": "Flavor Enhancer", "risk": "Moderate", "desc": "Excitotoxin sensitivity, headaches in sensitive consumers"},
    "INS621": {"name": "Monosodium Glutamate", "category": "Flavor Enhancer", "risk": "Moderate", "desc": "Mandatory FSSAI declaration if added"},
    "621": {"name": "Monosodium Glutamate", "category": "Flavor Enhancer", "risk": "Moderate", "desc": "Glutamate flavor booster"},
    "E627": {"name": "Disodium Guanylate", "category": "Flavor Enhancer", "risk": "Low", "desc": "Purine-rich; individuals with gout should avoid"},
    "INS627": {"name": "Disodium Guanylate", "category": "Flavor Enhancer", "risk": "Low", "desc": "Synergistic flavor enhancer"},
    "E631": {"name": "Disodium Inosinate", "category": "Flavor Enhancer", "risk": "Low", "desc": "Purine content; often meat/fish derived"},
    "INS631": {"name": "Disodium Inosinate", "category": "Flavor Enhancer", "risk": "Low", "desc": "Often combined with MSG"},

    # Synthetic Antioxidants
    "E319": {"name": "Tert-Butylhydroquinone (TBHQ)", "category": "Synthetic Antioxidant", "risk": "High", "desc": "Synthetic fat preservative; regulated maximum 200mg/kg by FSSAI/FDA"},
    "INS319": {"name": "TBHQ", "category": "Synthetic Antioxidant", "risk": "High", "desc": "Petroleum-derived antioxidant for frying oils"},
    "319": {"name": "TBHQ", "category": "Synthetic Antioxidant", "risk": "High", "desc": "Synthetic antioxidant"},
    "E320": {"name": "Butylated Hydroxyanisole (BHA)", "category": "Synthetic Antioxidant", "risk": "High", "desc": "Possible human endocrine disruptor and carcinogen under study"},
    "INS320": {"name": "BHA", "category": "Synthetic Antioxidant", "risk": "High", "desc": "Antioxidant with strict safety limits"},
    "E321": {"name": "Butylated Hydroxytoluene (BHT)", "category": "Synthetic Antioxidant", "risk": "Moderate", "desc": "Synthetic preservative for oils and cereals"},
    "INS321": {"name": "BHT", "category": "Synthetic Antioxidant", "risk": "Moderate", "desc": "Preservative additive"},

    # Artificial Sweeteners
    "E950": {"name": "Acesulfame Potassium", "category": "Artificial Sweetener", "risk": "Moderate", "desc": "High-intensity artificial sweetener; gut microbiome concerns"},
    "INS950": {"name": "Acesulfame K", "category": "Artificial Sweetener", "risk": "Moderate", "desc": "Zero-calorie synthetic sweetener"},
    "E951": {"name": "Aspartame", "category": "Artificial Sweetener", "risk": "High", "desc": "WHO IARC classified as possibly carcinogenic (Group 2B); Phenylketonuria warning"},
    "INS951": {"name": "Aspartame", "category": "Artificial Sweetener", "risk": "High", "desc": "Contains phenylalanine"},
    "E954": {"name": "Saccharin", "category": "Artificial Sweetener", "risk": "Moderate", "desc": "Synthetic sweetener"},
    "INS954": {"name": "Saccharin", "category": "Artificial Sweetener", "risk": "Moderate", "desc": "Calorie-free sweetener"},
    "E955": {"name": "Sucralose", "category": "Artificial Sweetener", "risk": "Moderate", "desc": "Chlorinated sucrose derivative, may affect glycemic control and microbiome"},
    "INS955": {"name": "Sucralose", "category": "Artificial Sweetener", "risk": "Moderate", "desc": "Artificial sweetener"}
}

ALLERGEN_REGISTRY: Dict[str, List[str]] = {
    "Gluten": ["wheat", "maida", "barley", "rye", "oats", "gluten", "semolina", "atta", "spelt"],
    "Dairy / Milk": ["milk", "lactose", "casein", "whey", "butter", "cheese", "cream", "ghee", "milk solids", "yogurt", "curd"],
    "Peanuts": ["peanut", "groundnut", "arachis oil", "monkey nut"],
    "Tree Nuts": ["almond", "cashew", "walnut", "pistachio", "hazelnut", "pecan", "macadamia", "brazil nut"],
    "Soy": ["soy", "soya", "soybean", "tofu", "soy lecithin", "edamame"],
    "Egg": ["egg", "albumin", "globulin", "ovalbumin", "yolk", "egg powder"],
    "Fish & Seafood": ["fish", "salmon", "tuna", "prawn", "shrimp", "crab", "lobster", "shellfish", "anchovy"],
    "Sesame": ["sesame", "til", "tahini", "gingelly"],
    "Sulphites": ["sulphite", "sulfite", "metabisulphite", "sulphur dioxide"]
}


class FoodLabelAuditor:
    """Production-ready Parser and Regulatory Auditor for Packaged Food Labels."""

    def __init__(self, tesseract_cmd: Optional[str] = None):
        if tesseract_cmd and PYTESSERACT_AVAILABLE:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    def preprocess_image(self, image_bytes: bytes) -> Tuple[np.ndarray, Image.Image]:
        """Preprocesses raw bytes: grayscale, adaptive contrast enhancement, thresholding."""
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img_bgr is None or img_bgr.size == 0:
            raise ValueError("Corrupt or invalid image buffer.")

        # Convert to grayscale
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # Contrast enhancement using CLAHE
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)

        # Bilateral filter to smooth while preserving text edges
        denoised = cv2.bilateralFilter(enhanced, 9, 75, 75)

        # Otsu thresholding
        _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        pil_img = Image.fromarray(thresh)
        return img_bgr, pil_img

    def extract_text(self, pil_img: Image.Image) -> str:
        """Extracts plain text using OCR, with safe fallback handling."""
        if not PYTESSERACT_AVAILABLE:
            return ""
        try:
            # PSM 6: Assume a single uniform block of text
            custom_config = r'--oem 3 --psm 6'
            text = pytesseract.image_to_string(pil_img, config=custom_config)
            return text.strip()
        except Exception as e:
            logger.warning("OCR failed: %s. Returning empty text.", str(e))
            return ""

    def parse_dates(self, raw_text: str) -> Dict[str, Any]:
        """
        Parses Manufacturing (MFG), Expiry (EXP) or Best Before duration.
        Computes remaining shelf life in days.
        """
        now = datetime.now()
        mfg_date: Optional[datetime] = None
        exp_date: Optional[datetime] = None
        mfg_str: Optional[str] = None
        exp_str: Optional[str] = None

        text_clean = raw_text.replace("\n", " ").replace(",", " ")

        # Date Regex Patterns
        date_pattern = r'(\b\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]\d{2,4}\b|\b\d{1,2}[-/\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]\d{2,4}\b|\b\d{2}/\d{2,4}\b)'

        # 1. Look for MFG / PKGD
        mfg_match = re.search(r'(?:MFG|MFD|MFR|PKGD|PACKED|MANUFACTURED)[^\w\d]{0,8}[:.-]?[^\w\d]{0,4}' + date_pattern, text_clean, re.IGNORECASE)
        if mfg_match:
            candidate = mfg_match.group(1).strip()
            try:
                mfg_date = date_parser.parse(candidate, fuzzy=True, dayfirst=True)
                mfg_str = mfg_date.strftime("%d-%b-%Y")
            except Exception:
                pass

        # 2. Look for EXP / USE BY
        exp_match = re.search(r'(?:EXP|EXPIRY|USE\s*BY|BEST\s*BEFORE)[^\w\d]{0,8}[:.-]?[^\w\d]{0,4}' + date_pattern, text_clean, re.IGNORECASE)
        if exp_match:
            candidate = exp_match.group(1).strip()
            try:
                exp_date = date_parser.parse(candidate, fuzzy=True, dayfirst=True)
                exp_str = exp_date.strftime("%d-%b-%Y")
            except Exception:
                pass

        # 3. Check for "Best Before X Months / Days from MFG"
        shelf_life_duration = None
        duration_match = re.search(r'BEST\s*BEFORE\s*(\d{1,2})\s*(MONTHS?|DAYS?|WEEKS?)\s*(?:FROM\s*(?:MFG|PKGD|PACKING|DATE))?', text_clean, re.IGNORECASE)
        if duration_match:
            count = int(duration_match.group(1))
            unit = duration_match.group(2).upper()
            shelf_life_duration = f"{count} {unit.lower()}"
            if mfg_date and not exp_date:
                if "MONTH" in unit:
                    exp_date = mfg_date + relativedelta(months=count)
                elif "WEEK" in unit:
                    exp_date = mfg_date + relativedelta(weeks=count)
                elif "DAY" in unit:
                    exp_date = mfg_date + relativedelta(days=count)
                exp_str = exp_date.strftime("%d-%b-%Y")

        # Calculate remaining shelf-life days
        shelf_life_status = "Date Unspecified"
        days_remaining: Optional[int] = None
        is_expired = False
        near_expiry = False

        if exp_date:
            days_remaining = (exp_date.date() - now.date()).days
            if days_remaining < 0:
                is_expired = True
                shelf_life_status = f"Expired ({abs(days_remaining)} days ago)"
            elif days_remaining <= 7:
                near_expiry = True
                shelf_life_status = f"Expiring Urgently ({days_remaining} days left)"
            elif days_remaining <= 30:
                near_expiry = True
                shelf_life_status = f"Expiring Soon ({days_remaining} days left)"
            else:
                shelf_life_status = f"Valid: {days_remaining} days remaining"

        return {
            "mfg_date": mfg_str,
            "exp_date": exp_str,
            "shelf_life_duration": shelf_life_duration,
            "days_remaining": days_remaining,
            "shelf_life_status": shelf_life_status,
            "is_expired": is_expired,
            "is_near_expiry": near_expiry,
        }

    def detect_additives(self, text: str) -> List[Dict[str, Any]]:
        """Identifies INS / E-numbers and chemical additives with risk descriptions."""
        detected = []
        seen_keys = set()
        clean_upper = text.upper()

        # Match (E\d{3,4}|INS\s*\d{3,4}|\b\d{3,4}[a-z]?\b)
        found_tokens = re.findall(r'\b(?:INS|E)?\s*(\d{3}[A-Z]?|\d{4})\b', clean_upper)

        for token in found_tokens:
            token_clean = token.strip()
            # Try matching with E prefix, INS prefix, or raw token
            match_key = None
            for candidate in [f"E{token_clean}", f"INS{token_clean}", token_clean]:
                if candidate in HARMFUL_ADDITIVES:
                    match_key = candidate
                    break

            if match_key and match_key not in seen_keys:
                seen_keys.add(match_key)
                meta = HARMFUL_ADDITIVES[match_key]
                detected.append({
                    "code": match_key,
                    "name": meta["name"],
                    "category": meta["category"],
                    "risk_level": meta["risk"],
                    "description": meta["desc"],
                })

        # Name-based matching for common harmful chemicals in ingredients list
        named_additives = [
            ("sodium benzoate", "INS 211", "Preservative", "High", "Can form carcinogenic benzene in acidic drinks"),
            ("potassium sorbate", "INS 202", "Preservative", "Low", "Generally recognized as safe; rare allergen"),
            ("tbhq", "INS 319", "Synthetic Antioxidant", "High", "Petroleum-derived preservative with strict limits"),
            ("monosodium glutamate", "INS 621", "Flavor Enhancer", "Moderate", "MSG excitotoxin sensitivity"),
            ("msg", "INS 621", "Flavor Enhancer", "Moderate", "Flavor enhancer MSG"),
            ("aspartame", "INS 951", "Artificial Sweetener", "High", "WHO/IARC Group 2B possible carcinogen"),
            ("sucralose", "INS 955", "Artificial Sweetener", "Moderate", "Synthetic sweetener"),
            ("acesulfame potassium", "INS 950", "Artificial Sweetener", "Moderate", "Synthetic sweetener"),
            ("tartrazine", "INS 102", "Synthetic Color", "High", "Azo dye linked to childhood hyperactivity"),
            ("sunset yellow", "INS 110", "Synthetic Color", "High", "Regulated azo colorant"),
            ("allura red", "INS 129", "Synthetic Color", "Moderate", "Synthetic azo dye"),
            ("palm oil", "Refined Palm Oil", "Fat / Lipid", "Moderate", "High saturated palmitic acid content"),
            ("hydrogenated vegetable oil", "Trans Fat", "Lipid", "High", "Source of harmful trans-fats; banned in multiple jurisdictions"),
            ("high fructose corn syrup", "HFCS", "Refined Sugar", "High", "Accelerates fatty liver and insulin resistance"),
        ]

        text_lower = text.lower()
        for phrase, code, cat, risk, desc in named_additives:
            if re.search(r'\b' + re.escape(phrase) + r'\b', text_lower):
                if code not in seen_keys:
                    seen_keys.add(code)
                    detected.append({
                        "code": code,
                        "name": phrase.title(),
                        "category": cat,
                        "risk_level": risk,
                        "description": desc,
                    })

        return detected

    def detect_allergens(self, text: str) -> List[Dict[str, Any]]:
        """Cross-references ingredients against standard allergen registries."""
        detected = []
        text_lower = text.lower()

        for allergen_group, keywords in ALLERGEN_REGISTRY.items():
            found_triggers = []
            for kw in keywords:
                if re.search(r'\b' + re.escape(kw) + r'\b', text_lower):
                    found_triggers.append(kw)

            if found_triggers:
                detected.append({
                    "group": allergen_group,
                    "triggers_found": list(set(found_triggers)),
                    "warning": f"Contains or may contain {allergen_group.lower()} derivatives ({', '.join(found_triggers[:3])}).",
                })

        return detected

    def calculate_regulatory_safety_score(
        self,
        date_info: Dict[str, Any],
        additives: List[Dict[str, Any]],
        allergens: List[Dict[str, Any]],
        raw_text: str,
    ) -> Tuple[int, str, List[str]]:
        """
        Calculates dynamic 0-100 Safety Index Score.
        Returns: (score, risk_verdict, flags_list)
        """
        score = 100
        flags = []

        # 1. Expiry deductions
        if date_info["is_expired"]:
            score -= 50
            flags.append(f"CRITICAL: Product is expired ({date_info['shelf_life_status']})")
        elif date_info["is_near_expiry"]:
            score -= 20
            flags.append(f"WARNING: Shelf-life expiring soon ({date_info['shelf_life_status']})")

        # 2. Additive deductions
        high_risk_additives = [a for a in additives if a["risk_level"] == "High"]
        mod_risk_additives = [a for a in additives if a["risk_level"] == "Moderate"]

        if high_risk_additives:
            score -= (len(high_risk_additives) * 15)
            for a in high_risk_additives:
                flags.append(f"High-Risk Additive: {a['name']} ({a['code']}) - {a['description']}")

        if mod_risk_additives:
            score -= (len(mod_risk_additives) * 7)
            for a in mod_risk_additives:
                flags.append(f"Moderate-Risk Additive: {a['name']} ({a['code']})")

        # 3. High Sodium / High Sugar Front-of-Pack warnings
        lower = raw_text.lower()
        if any(term in lower for term in ["high sodium", "high salt", "excess sodium"]):
            score -= 10
            flags.append("High Sodium Warning detected on label.")
        if any(term in lower for term in ["high sugar", "added sugar", "high in saturated fat"]):
            score -= 10
            flags.append("Elevated Added Sugar / Saturated Fat indicator found.")

        # 4. Allergens note (informative deduction)
        if allergens:
            score -= min(10, len(allergens) * 2)
            flags.append(f"Allergens Present: {', '.join([a['group'] for a in allergens])}")

        score = max(5, min(100, score))

        if score >= 75:
            verdict = "Safe (Compliant)"
            verdict_code = "safe"
        elif score >= 50:
            verdict = "Caution (Moderate Risk / Additives Present)"
            verdict_code = "caution"
        else:
            verdict = "High Risk (Critical Spoilage / Harmful Additives)"
            verdict_code = "high_risk"

        return score, verdict_code, flags

    def audit_label(self, image_bytes: bytes, fallback_text: Optional[str] = None) -> Dict[str, Any]:
        """
        Full end-to-end Label Safety Audit pipeline.
        Accepts raw image bytes, extracts text via OCR, parses dates, additives,
        allergens, and produces regulatory safety scorecard.
        """
        extracted_text = ""
        try:
            _, pil_img = self.preprocess_image(image_bytes)
            extracted_text = self.extract_text(pil_img)
        except Exception as e:
            logger.warning("Image preprocessing failed: %s", str(e))

        # Use fallback if OCR returned empty or was passed directly
        if not extracted_text.strip() and fallback_text:
            extracted_text = fallback_text

        if not extracted_text.strip():
            return {
                "success": False,
                "error": "No readable text could be extracted from the uploaded label.",
                "raw_text": "",
                "safety_score": 0,
                "verdict": "Unreadable Label",
                "verdict_code": "unknown",
                "dates": {},
                "additives": [],
                "allergens": [],
                "regulatory_flags": ["Image text is blurry, low contrast, or missing ingredients/dates."],
            }

        date_info = self.parse_dates(extracted_text)
        additives = self.detect_additives(extracted_text)
        allergens = self.detect_allergens(extracted_text)
        score, verdict_code, flags = self.calculate_regulatory_safety_score(
            date_info, additives, allergens, extracted_text
        )

        return {
            "success": True,
            "raw_text": extracted_text[:1200],  # Return truncated clean preview
            "safety_score": score,
            "verdict": (
                "Safe / Compliant"
                if verdict_code == "safe"
                else "Caution / Review Required"
                if verdict_code == "caution"
                else "High Regulatory Risk"
            ),
            "verdict_code": verdict_code,
            "dates": date_info,
            "additives": additives,
            "allergens": allergens,
            "regulatory_flags": flags,
            "summary": {
                "total_additives": len(additives),
                "total_allergens": len(allergens),
                "shelf_life_status": date_info.get("shelf_life_status", "Unknown"),
            },
        }
