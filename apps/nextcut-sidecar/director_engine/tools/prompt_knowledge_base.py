"""
Prompt Knowledge Base & Taxonomy RAG Simulator (High-Precision Production Level)

This module serves as the Level 2 knowledge retrieval layer for the Director Engine.
It contains MASSIVE, highly-optimized, production-tested prompt structures and rules,
synthesized from leading video models (Seedance 2.0, HunyuanVideo 1.5, Sora, LTX, Midjourney V6).
"""

from typing import Dict, List

class PromptKnowledgeBase:
    
    # =========================================================================
    # 1. 结构化高精度长提示词典范 (HIGH-PRECISION STRUCTURED PROMPTS)
    # =========================================================================
    # 这些不仅是标签，而是完整的结构化数百字的范例，用于直接指导大模型如何生成高质量、无幻觉的提示词。
    FULL_LENGTH_EXAMPLES = {
        "霸总": (
            "【Subject】A handsome young CEO with sharp, aristocratic facial features, styled with slightly messy but deliberate black hair. He is wearing a perfectly tailored, bespoke midnight-blue three-piece Italian suit, a crisp white dress shirt with the top two buttons undone, and a silver luxury mechanical watch gleaming on his left wrist. "
            "【Action】He walks slowly and dominantly toward the camera, his eyes locked intensely onto the viewer. He raises his right hand to loosely adjust his tie, exuding a cold but alluring aura. "
            "【Camera】Medium tracking shot moving backward slowly to match his pace. The camera is positioned slightly below eye level (low angle) to emphasize his authority and height. "
            "【Lighting】High-end cinematic studio lighting. A soft, large octabox acts as the key light, providing a flawless, glowing transition across his skin (Subsurface Scattering). A strong, cool-toned rim light from the back-left outlines his broad shoulders and jawline, separating him from the background. "
            "【Scene & Atmosphere】A luxurious, ultra-modern penthouse office at night. Floor-to-ceiling glass windows reveal a sprawling cyberpunk metropolis illuminated by rain-slicked neon lights (magenta and cyan reflections). Polished black marble floors reflect his sharp silhouette. The atmosphere is extremely expensive, tense, and romantically charged. "
            "【Parameters】Shot on 85mm portrait lens, f/1.4 aperture for a creamy, shallow depth of field. 8k resolution, hyper-realistic, photorealistic, cinematic color grading, Kodak Portra 400 film stock emulation."
        ),
        "仙侠": (
            "【Subject】An ethereal, immortal female cultivator (Xianxia protagonist) of breathtaking beauty. She wears intricate, multi-layered, flowing white and pale blue silk Hanfu robes adorned with silver thread embroidery of cranes and clouds. Her long, ink-black hair flows freely, partially secured by a glowing carved jade hairpin. "
            "【Action】She levitates gracefully inches above a crystal-clear, mirror-like lake. She raises her slender arms, performing an elegant, fluid martial arts hand seal. As she does, tiny, luminous blue spiritual particles (Qi) begin to swirl and spiral around her fingertips. "
            "【Camera】Wide establishing shot that slowly dollies in towards her. The camera movement is extremely smooth and stabilized, floating as if weightless, matching the ethereal anti-gravity physics of the scene. "
            "【Lighting】Ethereal, magical lighting. Soft, diffused moonlight illuminates the scene from above. Strong volumetric god rays (light shafts) pierce through a thin layer of mystical fog rolling over the water. Her skin glows with a subtle, pearlescent bioluminescence. "
            "【Scene & Atmosphere】An ancient, mystical Chinese fantasy realm. Towering, jagged karst mountains float in the sky in the deep background. The lake surface acts as a perfect, undisturbed mirror reflecting the giant, glowing full moon. The atmosphere is tranquil, ancient, divine, and profoundly magical. "
            "【Parameters】Shot on 35mm lens. Unreal Engine 5 render style, path tracing, global illumination. Majestic, epic fantasy aesthetic, highly detailed CGI VFX."
        ),
        "赛博朋克": (
            "【Subject】A gritty, battle-worn female cyberpunk mercenary. She has an asymmetrical undercut dyed neon pink, and a glowing cybernetic prosthetic left eye that emits a faint red laser scanning grid. She wears a heavy, oversized transparent PVC raincoat over a high-tech tactical vest, and dark leather combat boots. "
            "【Action】She stands completely still in the pouring rain, looking down an alleyway. Suddenly, she draws a heavy, futuristic plasma pistol from her thigh holster, aiming it directly at the camera. The pistol barrel begins to charge up with a blinding blue electrical glow. "
            "【Camera】Over-the-shoulder shot transitioning into a rapid snap zoom (crash zoom) onto her cybernetic eye and the glowing pistol barrel. "
            "【Lighting】High-contrast, harsh neon lighting. The only illumination comes from flickering, malfunctioning neon signs (toxic yellow and magenta) reflecting off the wet PVC of her coat and the oily puddles on the ground. Deep, crushed black shadows (Chiaroscuro) hide the rest of her face. "
            "【Scene & Atmosphere】A dystopian, claustrophobic mega-city slum alleyway. Thick, volumetric steam billows from subway grates. Trash and tangled holographic wires litter the background. The atmosphere is tense, dangerous, gritty, and technologically suffocating. "
            "【Parameters】Blade Runner 2049 aesthetic. Shot on Anamorphic lenses, featuring horizontal blue lens flares and oval bokeh. 35mm film grain, cinematic color grading, teal and orange palette."
        ),
        "图听": (
            "【Subject】A highly detailed, hyper-realistic anime-style portrait of a melancholic young man. He has soft, messy silver hair falling over sad, expressive emerald-green eyes. He wears a thick, cozy, oversized cream-colored knit sweater that covers half his hands. "
            "【Action】The action is extremely minimal and restrained (Audio-driven visual novel style). He maintains direct, unbroken, emotional eye contact with the lens. His chest rises and falls with slow, heavy breathing. The wind gently rustles a few strands of his silver hair. A single, perfectly rendered tear wells up in his right eye and slowly slides down his cheek. "
            "【Camera】Static, locked-off extreme close-up (ECU) focusing entirely on his eyes and facial micro-expressions. Zero camera translation or rotation. "
            "【Lighting】Soft, diffused, overcast window lighting coming from the top right. A very gentle catchlight (eye reflection) makes his emerald eyes sparkle with deep emotion. The lighting is flat but incredibly flattering, avoiding any harsh facial shadows. "
            "【Scene & Atmosphere】The background is completely blown out and abstract due to extreme depth of field, showing only soft, warm, blurred circles of light (bokeh) suggesting a cozy indoor café. The atmosphere is intimate, heartbreaking, healing, and deeply empathetic. "
            "【Parameters】Makoto Shinkai and Kyoto Animation style. 135mm telephoto lens, f/1.2 maximum aperture. Cel-shaded but with 3D subsurface scattering on the skin. Ultra-detailed eyes and eyelashes."
        ),
        "武打动作": (
            "【Subject】Two martial arts masters in traditional, tattered linen robes. One wears dark charcoal, the other wears stark white. Both are covered in sweat and dirt, muscles tense, faces grim with concentration. "
            "【Action】The master in black leaps into the air, performing a rapid, twisting roundhouse kick. The master in white perfectly ducks under the strike, sweeping his leg across the muddy ground in a counter-attack. Mud and water violently splash outward from the impact of their movements. "
            "【Camera】High-speed FPV drone camera or whip pan. The camera dynamically tracks the spinning kick, banking and rotating with the combatants. Severe motion blur on the edges of the frame heightens the kinetic energy. "
            "【Lighting】Harsh, dramatic midday sunlight piercing through a dense bamboo forest overhead. The light is fragmented, casting moving, high-contrast stripe shadows across their bodies. "
            "【Scene & Atmosphere】A muddy, rain-soaked clearing deep within an ancient, overgrown bamboo forest. Bamboo stalks sway violently in the wind generated by their movements. The atmosphere is brutal, high-octane, and desperate. "
            "【Parameters】Wong Kar-wai martial arts aesthetic (Ashes of Time). Step-printed slow motion mixed with real-time speed ramps. High shutter speed (45-degree shutter angle) for crisp, stuttering action droplets. Gritty 16mm film texture."
        )
    }

    # =========================================================================
    # 2. 核心光学与物理引擎约束 (OPTICAL & PHYSICS CONSTRAINTS)
    # =========================================================================
    PHYSICS_CLUSTERS = {
        "微距": (
            "【Optical Physics】Extreme Macro Photography. The camera lens is virtually touching the subject. Depth of Field is razor-thin (f/2.8 macro). "
            "Only a millimeter-thick slice of the subject is in sharp focus. Background and foreground elements immediately melt into massive, creamy, abstract bokeh circles. "
            "Microscopic textures are revealed: the individual weave of fabric threads, individual pores and peach fuzz on skin, or the compound eyes of an insect. "
            "Movement must be microscopic and extremely slow to prevent the subject from leaving the focal plane."
        ),
        "广角畸变": (
            "【Optical Physics】14mm Ultra-Wide Angle Lens. Extreme forced perspective. "
            "Objects close to the lens appear massive and dominant, while background elements recede rapidly into the distance. "
            "Straight lines near the edges of the frame bow outward (barrel distortion). "
            "Camera movements (like tracking or dollying) feel exponentially faster and more aggressive due to the wide field of view."
        ),
        "长焦压缩": (
            "【Optical Physics】200mm Telephoto Lens. Extreme spatial compression. "
            "The background appears unnaturally large and pulled immediately behind the foreground subject. "
            "Parallax effect is minimized. The Depth of Field is completely flattened. "
            "Often used to make a subject look overwhelmed by a massive background element (e.g., a giant moon or a pursuing crowd)."
        )
    }

    # =========================================================================
    # 3. 生成模型强制纪律 (HARD RULES FOR VIDEO MODELS - EXTREMELY CRITICAL)
    # =========================================================================
    HARD_RULES = (
        "### CRITICAL SEEDANCE 2.0 / LTX / HUNYUAN 1.5 MODEL CONSTRAINTS (MUST OBEY) ###\n"
        "1. THE HUNYUAN-1.5 FORMULA: Every generated prompt MUST follow the strict structural format: [Shot Type] + [Subject & Appearance] + [Subject Motion/Action] + [Camera Movement] + [Lighting Direction] + [Scene/Environment] + [Style/Atmosphere] + [Parameters/Constraints].\n"
        "2. TEMPORAL SEQUENCING (ANTI-HALLUCINATION): AI models hallucinate if given simultaneous complex actions. You MUST use sequential conjunctions for complex actions. E.g., 'First, the character draws the sword. Then, they step forward.' Do NOT write 'The character draws the sword while stepping forward.'\n"
        "3. DECOUPLED MOTION PLANNING (VidCRAFT3 standard): Separate object motion from camera motion explicitly. Do not blend them. 'Subject walks left' is object motion. 'Camera pans right' is camera motion.\n"
        "4. NO ABSTRACT EMOTIONS: Do not write 'She feels sad'. Instead write physical manifestations: 'A tear slides down her pale cheek'.\n"
        "5. SPATIAL TRAJECTORIES (LAMP standard): Use precise 3D directional words (Foreground-left, Background-right, Z-axis depth). E.g., 'A hand enters from the bottom left of the frame moving towards the center'.\n"
        "6. PHYSICAL INTERACTION GRAVITY: When objects interact, describe the physics mass/weight. E.g., 'The heavy iron sword strikes the concrete, sending a shockwave of cracked stone and sparks'.\n"
        "7. REFERENCE SYNTAX: NO @Image1 or @Video1 tags. Use exact natural language: 'image 1 as the character's face', 'video 1 as the camera trajectory'.\n"
        "8. DETAIL DENSITY: A professional prompt must be between 80 to 120 words. Describe clothing materials, lighting sources, and camera focal lengths.\n"
    )

    # =========================================================================
    # 4. 图像生成高精度字典 (IMAGE GENERATION DICTIONARY - Midjourney v6 / SDXL / Flux)
    # =========================================================================
    # 基于 Github (cbpoole, willwulfken) 和互联网开源高分提示词库构建
    IMAGE_GENERATION_CLUSTERS = {
        "角色定妆图 (Character Turnaround Sheet)": (
            "【Subject】Character turnaround sheet of a [Description], character design sheet, concept art sketches. "
            "【Composition】Front view, side profile view, back view, multiple angles, full-body shot. "
            "【Environment】Neutral white background, clean studio lighting. "
            "【Details】Include detailed material textures, high resolution, 8k. "
            "【Midjourney Syntax】--ar 3:2 --stylize 250 --v 6.0\n"
            "*Rule*: Must include 'character turnaround sheet, multiple angles, neutral white background' to ensure usability for FaceID/ControlNet."
        ),
        "角色表情包 (Character Expression Sheet)": (
            "【Subject】Character expression sheet of a [Description], character design sheet, concept art. "
            "【Composition】A grid of facial expressions: smiling, angry, sad, surprised, neutral. Close-up portraits. "
            "【Environment】Neutral white background. "
            "【Midjourney Syntax】--ar 16:9 --v 6.0 --style raw"
        ),
        "史诗感关键帧 (Epic Storyboard Keyframe)": (
            "【Subject】[Subject] performing [Frozen Action]. "
            "【Camera】Cinematic extreme wide shot (EWS), shot on 14mm lens, establishing shot. "
            "【Lighting】Dramatic volumetric god rays piercing through thick atmospheric fog. Rembrandt lighting on the subject. "
            "【Atmosphere】Epic, awe-inspiring, monumental scale. "
            "【Midjourney Syntax】Hyper-detailed, photorealistic, Unreal Engine 5 render, award-winning cinematography --ar 16:9 --stylize 300 --v 6.0"
        ),
        "动作特写关键帧 (Action Close-up Keyframe)": (
            "【Subject】[Subject] in the middle of [Frozen Action, e.g., swinging a glowing neon katana]. "
            "【Camera】Dynamic Dutch angle close-up (CU), shot on 50mm lens. "
            "【Lighting】High-contrast chiaroscuro lighting, harsh rim light separating subject from the dark background. "
            "【Atmosphere】Intense, gritty, high-octane kinetic energy, frozen in time. "
            "【Midjourney Syntax】Cinematic still, film grain, motion blur on the edges, 8k resolution --ar 16:9 --v 6.0"
        ),
        "环境概念设计 (Environmental Concept Art)": (
            "【Environment】[Detailed Description of the Scene, e.g., a sprawling cyberpunk metropolis or a lush elven forest]. "
            "【Camera】Establishing wide shot, panoramic view. "
            "【Lighting】Golden hour sunlight or neon reflections in rain puddles. "
            "【Style】Craig Mullins concept art style, matte painting, highly detailed, atmospheric perspective, epic scale. "
            "【Midjourney Syntax】--ar 16:9 --stylize 400 --v 6.0"
        ),
        "黑白电影分镜 (Film Noir/B&W Storyboard)": (
            "【Subject】[Subject] doing [Action]. "
            "【Camera】Low angle medium shot. "
            "【Lighting】High-contrast black and white, harsh Venetian blind shadows (gobo lighting). "
            "【Atmosphere】Classic Film Noir, 1940s detective movie aesthetic, gritty, suspenseful. "
            "【Midjourney Syntax】Monochrome, heavy 35mm film grain, vintage camera effect --ar 16:9 --v 6.0"
        )
    }

    SHORT_DRAMA_CLUSTERS = {
        "2秒情绪钩子 (2-Second Hook)": (
            "【Short Drama Standard】The first 2 seconds must contain extreme visual tension or a status-quo breaking action. "
            "【Subject】A tear-stained bride in a torn wedding dress. "
            "【Action】She violently throws a diamond ring into a roaring fireplace. "
            "【Camera】Snap zoom from a medium shot to an extreme close-up on the ring hitting the flames. "
            "【Lighting】High-contrast, warm firelight illuminating her angry face, cool ambient rain light from the window. "
            "【Pacing】Fast, kinetic, immediate payoff. "
            "【Midjourney/Seedance Syntax】Cinematic, highly detailed, dramatic action, 8k --ar 9:16 --v 6.0"
        ),
        "竖屏情绪特写 (Vertical Drama Close-up)": (
            "【Short Drama Standard】Optimized for 9:16 vertical mobile viewing. Characters must occupy the center-upper third of the frame. "
            "【Subject】The cold billionaire CEO looking down. "
            "【Action】He uses his thumb and forefinger to forcefully tilt the protagonist's chin up. "
            "【Camera】Static tight close-up (CU), extreme shallow depth of field (f/1.2). "
            "【Lighting】Rembrandt lighting, glamorous and intimidating. "
            "【Midjourney/Seedance Syntax】Vertical drama framing, intense eye contact, photorealistic skin texture, subsurface scattering --ar 9:16 --style raw"
        ),
        "耳光/冲突瞬间 (Slap/Conflict Impact)": (
            "【Short Drama Standard】High-impact physical conflict. Must decouple camera motion from subject motion to prevent artifacting. "
            "【Subject】A wealthy antagonist raising her hand. "
            "【Action】She swings her hand in a vicious slap, sending a wine glass crashing to the floor. "
            "【Camera】Handheld camera shake, whip pan following the breaking glass. "
            "【Audio Trigger】She screams: \"You are nothing!\" "
            "【Midjourney/Seedance Syntax】Action shot, high shutter speed, frozen motion blur, dramatic lighting --ar 9:16"
        )
    }

    # =========================================================================
    # 5. VIRAL SOCIAL MEDIA HOOKS (HIGGSFIELD STANDARD)
    # =========================================================================
    VIRAL_SOCIAL_HOOKS = {
        "满足感转化钩子 (Satisfying Transformation)": (
            "【Hook Structure】0.0-0.3s: Macro close-up of grimy/stained surface. 0.3-0.8s: Zoom out to reveal object, text 'THIS IS DISGUSTING'. 0.8-1.5s: Action begins (scrubbing/cleaning) with ASMR sound. 1.5-2.0s: Fast-motion transformation, revealing brilliant white surface. "
            "【Audio】Original ASMR cleaning sounds + upbeat music swelling at 1.5s. "
            "【Parameters】9:16 vertical, iPhone macro lens feel, bright satisfying color grade."
        ),
        "荒诞喜剧钩子 (Comedy Skit Deadpan)": (
            "【Hook Structure】0.0-0.6s: Character looks directly at camera, deadpan. 0.6-1.2s: Character delivers absurd statement (e.g., 'I just realized my cat is a spy'). 1.2-2.0s: Immediate hard cut to visual proof of absurdity. "
            "【Audio】Room tone -> comedic underscore -> laugh track at 1.5s. "
            "【Parameters】9:16 vertical, static camera, bright even studio lighting."
        ),
        "不可能的物理现象 (Impossible Visual)": (
            "【Hook Structure】0.0-0.7s: Normal scene. 0.7-1.5s: Introduce anomaly (e.g., gravity inverted, object floating). Text: 'WAIT...'. 1.5-2.0s: Camera angle shifts to reveal the full impossibility. Text: 'HOW???'. "
            "【Audio】Subtle tension music -> dramatic sting/whoosh at anomaly reveal. "
            "【Parameters】Extremely steady camera, hyper-realistic rendering, seamless CGI integration."
        )
    }

    IMAGE_HARD_RULES = (
        "### CRITICAL MIDJOURNEY V6 / SDXL / FLUX IMAGE RULES ###\n"
        "1. NO VIDEO TERMS: Never use words like 'dolly in', 'pan left', 'slow motion'. This is a STATIC image.\n"
        "2. V6 NATURAL LANGUAGE: Midjourney v6 prefers natural, descriptive sentences over comma-separated keywords. Describe the relationship between objects.\n"
        "3. ASPECT RATIO: Always append --ar (e.g., --ar 16:9 for video storyboards, --ar 3:2 for character sheets).\n"
        "4. STYLE RAW: Use '--style raw' for photographic/cinematic realism to reduce the default AI 'plastic' aesthetic.\n"
        "5. CHARACTER CONSISTENCY: For character generation, you must enforce a clean background if it's a reference sheet.\n"
    )

    @classmethod
    def retrieve_context(cls, keywords: List[str]) -> str:
        """
        Retrieves massive, dense, full-length prompt templates based on keywords.
        This provides the LLM with true, high-precision structural examples to mimic.
        """
        context_parts = [cls.HARD_RULES]
        
        kw_lower = [k.lower() for k in keywords]
        
        # Helper to scan a dictionary and append matches
        def scan_dict(d: Dict[str, str], prefix: str):
            for key, text in d.items():
                if key in kw_lower or any(part in key for part in kw_lower):
                    context_parts.append(f"--- [EXAMPLE: {prefix} - {key.upper()}] ---\n{text}\n")

        scan_dict(cls.FULL_LENGTH_EXAMPLES, "HIGH-PRECISION VIDEO PROMPT TEMPLATE")
        scan_dict(cls.PHYSICS_CLUSTERS, "OPTICAL PHYSICS RULE")
        scan_dict(cls.IMAGE_GENERATION_CLUSTERS, "IMAGE GENERATION PROMPT (Midjourney/SDXL)")
        scan_dict(cls.SHORT_DRAMA_CLUSTERS, "SHORT DRAMA (短剧) / 2-SECOND HOOK PROMPT")
        scan_dict(cls.VIRAL_SOCIAL_HOOKS, "VIRAL SOCIAL MEDIA HOOK (TikTok/Reels/Shorts)")
                
        if len(context_parts) == 1:
            # Provide at least one massive example if no direct match, to set the standard.
            context_parts.append(f"--- [EXAMPLE: HIGH-PRECISION VIDEO PROMPT TEMPLATE - BASELINE] ---\n{cls.FULL_LENGTH_EXAMPLES['霸总']}\n")
            context_parts.append(f"--- [EXAMPLE: IMAGE GENERATION PROMPT - BASELINE] ---\n{cls.IMAGE_GENERATION_CLUSTERS['角色定妆图 (Character Turnaround Sheet)']}\n")
            context_parts.append(f"--- [EXAMPLE: STORYBOARD KEYFRAME - BASELINE] ---\n{cls.IMAGE_GENERATION_CLUSTERS['史诗感关键帧 (Epic Storyboard Keyframe)']}\n")
            
        # Append Image Hard Rules if it's likely an image generation request
        if any(kw in str(keywords).lower() for kw in ["character sheet", "storyboard", "keyframe", "midjourney", "image"]):
            context_parts.insert(1, cls.IMAGE_HARD_RULES)
            
        return "\n\n".join(context_parts)
    
    @classmethod
    def extract_keywords_from_text(cls, text: str) -> List[str]:
        text_lower = text.lower()
        matched = []
        
        aliases = {
            "霸总": ["ceo", "billionaire", "总裁", "luxury romance", "甜宠"],
            "仙侠": ["xianxia", "wuxia", "ancient chinese", "immortal", "古风"],
            "赛博朋克": ["cyberpunk", "sci-fi", "neon", "blade runner", "未来"],
            "图听": ["audio-driven", "visual novel", "静态", "图听漫剧", "情绪特写"],
            "武打动作": ["action", "combat", "fight", "martial arts", "动作戏"],
            
            "微距": ["macro", "extreme close-up", "ecu", "特写"],
            "广角畸变": ["wide angle", "14mm", "fisheye", "广角"],
            "长焦压缩": ["telephoto", "200mm", "compression", "长焦"]
        }
        
        for k, als in aliases.items():
            for a in als:
                if a in text_lower and k not in matched:
                    matched.append(k)
                    
        return matched
