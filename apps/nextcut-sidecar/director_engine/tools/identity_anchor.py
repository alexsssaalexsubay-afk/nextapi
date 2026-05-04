"""Identity Anchor — 跨镜头角色一致性锁定机制。

参考 MiniStudio 的 Identity Grounding 2.0 思路：
- Master Reference 肖像注入每一个生成步骤
- 视觉锚点确保 Emma 在 Shot 1 和 Shot 60 看起来一样
- Sequential Memory：每个镜头以上一个镜头的最后一帧为基础

Seedance 2.0 特别擅长角色一致性：
- 通过 image_urls 数组传入参考图锁定角色外观
- 跨镜头使用同一组 reference images 保持一致
- 自动化分镜中面容维持率远超 Kling 和 Runway
"""

from __future__ import annotations

from dataclasses import dataclass, field

from director_engine.interfaces.models import Character, ReferenceAsset


@dataclass
class IdentityAnchor:
    """一个角色在整个项目中的视觉锚点。"""
    character_name: str
    master_reference: str = ""
    additional_references: list[str] = field(default_factory=list)
    appearance_lock: str = ""
    consistency_notes: str = ""


class IdentityManager:
    """管理项目中所有角色的视觉一致性。"""

    def __init__(self) -> None:
        self._anchors: dict[str, IdentityAnchor] = {}

    def register_character(
        self, character: Character, master_ref_url: str = ""
    ) -> IdentityAnchor:
        anchor = IdentityAnchor(
            character_name=character.name,
            master_reference=master_ref_url,
            additional_references=character.reference_images[:8],
            appearance_lock=character.appearance,
            consistency_notes=f"Maintain exact appearance: {character.appearance}",
        )
        self._anchors[character.name] = anchor
        return anchor

    def get_anchor(self, character_name: str) -> IdentityAnchor | None:
        return self._anchors.get(character_name)

    def get_references_for_shot(
        self, shot_characters: list[str]
    ) -> list[ReferenceAsset]:
        """为某个镜头生成参考资产列表，确保角色一致性。"""
        refs: list[ReferenceAsset] = []
        for char_name in shot_characters:
            anchor = self._anchors.get(char_name)
            if not anchor:
                continue
            if anchor.master_reference:
                refs.append(ReferenceAsset(
                    url=anchor.master_reference,
                    type="image",
                    role=f"character_identity:{char_name}",
                    description=f"Master reference for {char_name}. {anchor.appearance_lock}",
                ))
            for i, ref_url in enumerate(anchor.additional_references[:2]):
                refs.append(ReferenceAsset(
                    url=ref_url,
                    type="image",
                    role=f"character_supplement:{char_name}",
                    description=f"Additional angle/expression for {char_name}",
                ))
        return refs[:9]

    def build_consistency_prompt_suffix(self, shot_characters: list[str]) -> str:
        """生成一致性约束后缀，附加到每个镜头的prompt末尾。"""
        parts = []
        for char_name in shot_characters:
            anchor = self._anchors.get(char_name)
            if anchor and anchor.appearance_lock:
                parts.append(
                    f"The character {char_name}'s appearance stays consistent with image reference: "
                    f"{anchor.appearance_lock}"
                )
        if not parts:
            return ""
        return "[Consistency: " + ". ".join(parts) + "]"

    @property
    def all_anchors(self) -> dict[str, IdentityAnchor]:
        return dict(self._anchors)
