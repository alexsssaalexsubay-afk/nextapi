// prompt-dictionary.ts
// Comprehensive Prompt & Style Taxonomy for Director Engine
// Note: This is the Level 1 Taxonomy for UI dropdowns and Agent constraints.
// A full production database (Level 2, e.g., Danbooru tags, JourneyDB) should be hosted in a backend vector DB.

export const CAMERA_MOVEMENTS = {
  basic: [
    { id: "cam_static", label: "Static Shot", value: "static shot, locked off camera" },
    { id: "cam_pan_left", label: "Pan Left", value: "pan left" },
    { id: "cam_pan_right", label: "Pan Right", value: "pan right" },
    { id: "cam_tilt_up", label: "Tilt Up", value: "tilt up" },
    { id: "cam_tilt_down", label: "Tilt Down", value: "tilt down" },
  ],
  advanced: [
    { id: "cam_zoom_in", label: "Slow Zoom In", value: "slow zoom in" },
    { id: "cam_zoom_out", label: "Slow Zoom Out", value: "slow zoom out" },
    { id: "cam_dolly_in", label: "Dolly In", value: "dolly in, moving towards subject" },
    { id: "cam_dolly_out", label: "Dolly Out", value: "dolly out, moving away from subject" },
    { id: "cam_tracking", label: "Tracking Shot", value: "tracking shot following subject" },
    { id: "cam_crane_up", label: "Crane Up", value: "crane shot moving up, revealing scale" },
    { id: "cam_orbit", label: "Orbit/Arc", value: "orbiting around subject 360 degrees, arc shot" },
  ],
  dynamic: [
    { id: "cam_drone_fpv", label: "FPV Drone", value: "FPV drone fast flight, agile movement" },
    { id: "cam_handheld", label: "Handheld", value: "shaky handheld camera, documentary style, visceral" },
    { id: "cam_whip_pan", label: "Whip Pan", value: "fast whip pan, motion blur transition" },
    { id: "cam_dutch_angle", label: "Dutch Angle", value: "dutch angle, tilted horizon, unease" },
    { id: "cam_crash_zoom", label: "Crash Zoom", value: "snap zoom, sudden crash zoom to close-up" },
  ]
};

export const OPTICS_AND_LENSES = [
  { id: "lens_14mm", label: "14mm Ultra Wide", value: "14mm ultra wide angle lens, distorted perspective, fish-eye effect" },
  { id: "lens_24mm", label: "24mm Wide", value: "24mm wide angle lens, deep depth of field, environmental context" },
  { id: "lens_35mm", label: "35mm Documentary", value: "35mm lens, natural perspective, documentary feel" },
  { id: "lens_50mm", label: "50mm Standard", value: "50mm normal lens, human eye perspective" },
  { id: "lens_85mm", label: "85mm Portrait", value: "85mm portrait lens, compression, beautiful bokeh" },
  { id: "lens_200mm", label: "200mm Telephoto", value: "200mm telephoto lens, extreme background compression, flattened perspective" },
  { id: "lens_macro", label: "Macro Lens", value: "macro photography, extreme close-up detail, razor thin depth of field" },
  { id: "lens_anamorphic", label: "Anamorphic", value: "anamorphic lens, oval bokeh, horizontal lens flares, cinematic aspect ratio" },
  { id: "aperture_f12", label: "f/1.2 (Shallow DOF)", value: "f/1.2 aperture, extremely shallow depth of field, blurred background, subject isolated" },
  { id: "aperture_f16", label: "f/16 (Deep Focus)", value: "f/16 aperture, deep focus, everything sharp from foreground to background" },
];

export const LIGHTING_STYLES = {
  cinematic_setups: [
    { id: "light_rembrandt", label: "Rembrandt", value: "Rembrandt lighting, triangle of light on cheek, dramatic portrait" },
    { id: "light_butterfly", label: "Butterfly/Paramount", value: "butterfly lighting, paramount lighting, glamorous, under-nose shadow" },
    { id: "light_split", label: "Split Lighting", value: "split lighting, half face in deep shadow, mysterious, tense" },
    { id: "light_rim", label: "Rim/Backlight", value: "strong rim lighting from behind, glowing edges, separated from background" },
  ],
  environmental: [
    { id: "light_golden_hour", label: "Golden Hour", value: "golden hour, warm sunlight, long casting shadows, late afternoon" },
    { id: "light_blue_hour", label: "Blue Hour", value: "blue hour, twilight, cool ambient light, post-sunset" },
    { id: "light_overcast", label: "Overcast/Soft", value: "overcast sky, flat soft lighting, diffuse shadows, melancholy" },
    { id: "light_harsh", label: "Harsh Midday", value: "harsh midday sunlight, sharp hard shadows, high contrast" },
  ],
  stylized: [
    { id: "light_neon", label: "Cyberpunk Neon", value: "neon lighting, pink and cyan glowing practical lights, reflections" },
    { id: "light_chiaroscuro", label: "Chiaroscuro", value: "chiaroscuro, extreme contrast between light and dark, baroque painting style" },
    { id: "light_volumetric", label: "Volumetric/God Rays", value: "volumetric lighting, god rays piercing through dust/smoke/fog" },
    { id: "light_gobo", label: "Gobo Shadows", value: "gobo lighting, venetian blind shadows across face, film noir" },
  ]
};

export const MANGA_DRAMA_TROPES = {
  mangaGenres: [
    { id: "md_ceo", label: "霸总甜宠 (Billionaire Romance)", value: "modern luxury, wealthy CEO romance, elegant haute couture, bright soft high-key lighting, high-end penthouse" },
    { id: "md_xianxia", label: "古风仙侠 (Xianxia Fantasy)", value: "ancient Chinese xianxia style, flowing silk hanfu robes, magical spiritual aura, floating mountains, ethereal glowing lighting" },
    { id: "md_palace", label: "宫斗权谋 (Palace Drama)", value: "ancient Chinese imperial palace, intricate embroidered costumes, golden hairpins, oppressive architecture, scheming atmosphere" },
    { id: "md_rebirth", label: "重生复仇 (Rebirth/Revenge)", value: "dramatic tension, intense eye contact, split lighting, elegant but dark aristocratic setting, rain outside window" },
    { id: "md_campus", label: "青春校园 (Campus Youth)", value: "youth campus slice of life, bright sunny day, pristine school uniforms, cherry blossoms falling, soft anime filter" },
    { id: "md_esports", label: "电竞热血 (E-Sports)", value: "dark gaming arena, RGB neon LED lighting, headset, intense focus, glowing computer screens illuminating faces" },
    { id: "md_survival", label: "末日生存 (Apocalypse Survival)", value: "ruined city, overgrown nature, tactical gear, dirt and grime on face, harsh survival atmosphere" },
    { id: "md_short_drama_slap", label: "短剧·扇耳光 (Drama Slap)", value: "short drama style, intense physical conflict, wealthy antagonist slapping protagonist, breaking glass, handheld shake, dramatic vertical framing --ar 9:16" },
    { id: "md_short_drama_kneel", label: "短剧·下跪/逆袭 (Revenge Kneel)", value: "short drama style, dramatic power shift, protagonist looking down at kneeling antagonist, extreme low angle shot, harsh rim light, epic revenge --ar 9:16" },
    { id: "md_viral_satisfying", label: "病毒钩子·解压清洁 (ASMR Clean)", value: "viral social hook, satisfying transformation, ASMR cleaning, macro lens, dramatic before and after, 9:16 vertical --ar 9:16" },
    { id: "md_viral_impossible", label: "病毒钩子·不可能视觉 (Impossible)", value: "viral social hook, impossible physics anomaly, gravity inverted, seamless CGI, tension building, 9:16 vertical --ar 9:16" }
  ],
  character_archetypes: [
    { id: "char_cold_ceo", label: "冷酷霸总 (Cold CEO)", value: "tall handsome man, tailored bespoke suit, cold piercing gaze, immaculate styling, domineering presence" },
    { id: "char_gentle_senior", label: "阳光学长 (Gentle Senior)", value: "warm smile, casual stylish clothes, sunlight hitting hair, approachable, holding books or basketball" },
    { id: "char_villainess", label: "恶毒女配 (Villainess)", value: "glamorous woman, heavy makeup, red lips, smirking, wearing luxurious designer dress, arrogant posture" },
    { id: "char_strong_female", label: "大女主 (Strong FL)", value: "confident woman, sharp business attire or combat gear, determined eyes, independent, wind blowing hair" },
  ]
};

export const RENDER_AND_MATERIAL_QUALITY = [
  { id: "render_ue5", label: "Unreal Engine 5", value: "Unreal Engine 5 render, Lumen global illumination, nanite, insanely detailed" },
  { id: "render_octane", label: "Octane Render", value: "Octane render, pathtracing, physically based rendering (PBR), cinematic realism" },
  { id: "mat_subsurface", label: "Subsurface Scattering", value: "subsurface scattering on skin, realistic translucent flesh, lifelike portraits" },
  { id: "mat_raytracing", label: "Raytraced Reflections", value: "raytraced reflections, glossy wet surfaces, perfect mirror reflections" },
  { id: "mat_volumetric", label: "Volumetric Fog", value: "thick volumetric fog, atmospheric scattering, dense particle simulation" },
  { id: "texture_film_grain", label: "35mm Film Grain", value: "authentic 35mm film grain, Kodak Portra 400 emulation, vintage analog texture" },
];

export const ART_STYLES = [
  { id: "art_photorealistic", label: "Photorealistic", value: "hyper-realistic, 8k resolution, raw photo, fujifilm, award-winning photography" },
  { id: "art_anime_cel", label: "Cel Shaded Anime", value: "flat colors, cel-shaded anime, distinct linework, 2D animation, Makoto Shinkai style sky" },
  { id: "art_3d_pixar", label: "3D Render (Pixar/Disney)", value: "3D rendered animation, Pixar Disney style, soft subsurface scattering, expressive big eyes" },
  { id: "art_comic_book", label: "Western Comic", value: "comic book style, halftone patterns, dynamic heavy inking, bold primary colors, Frank Miller style" },
  { id: "art_watercolor", label: "Watercolor", value: "watercolor painting, soft blending, visible cold-pressed paper texture, wet-on-wet technique, ethereal" },
  { id: "art_oil_painting", label: "Oil Painting", value: "classic oil painting, thick impasto brush strokes, rich colors, canvas texture, Rembrandt lighting" },
  { id: "art_claymation", label: "Claymation", value: "stop-motion claymation, tactile clay textures, miniature crafted sets, visible artist fingerprints" },
  { id: "art_pixel_art", label: "Pixel Art", value: "16-bit pixel art, retro video game style, careful dithering, limited color palette, isometric perspective" },
  { id: "art_concept", label: "Concept Art", value: "digital concept art, ArtStation trending, loose brushwork in background, highly detailed focal point, epic scale" },
];

export const IMAGE_PROMPT_PRESETS = {
  character_sheets: [
    { id: "img_char_turnaround", label: "标准三视图 (Turnaround)", value: "character turnaround sheet, front view, side profile view, back view, full-body shot, neutral white background, concept art sketches --ar 3:2 --stylize 250 --v 6.0" },
    { id: "img_char_expression", label: "表情集 (Expression Sheet)", value: "character expression sheet, grid of facial expressions, smiling, angry, sad, surprised, neutral, close-up portraits, neutral white background --ar 16:9 --v 6.0" },
    { id: "img_char_outfit", label: "服装展示 (Outfit Grid)", value: "character outfit design sheet, wearing different variations of clothing, fashion illustration, flat lighting, white background, detailed fabric textures --ar 16:9 --v 6.0" },
    { id: "img_char_dynamic", label: "动态设定图 (Dynamic Poses)", value: "character action pose sheet, dynamic combat poses, jumping, striking, running, cinematic lighting, concept art illustration --ar 3:2 --v 6.0" },
  ],
  storyboard_keyframes: [
    { id: "img_sb_epic", label: "史诗大远景 (Epic EWS)", value: "Cinematic extreme wide shot (EWS), establishing shot, epic awe-inspiring monumental scale, dramatic volumetric god rays piercing through fog, hyper-detailed, photorealistic, Unreal Engine 5 render --ar 16:9 --stylize 300 --v 6.0" },
    { id: "img_sb_action", label: "高燃动作特写 (Action CU)", value: "Dynamic Dutch angle close-up (CU), intense gritty high-octane kinetic energy, frozen in time, high-contrast chiaroscuro lighting, harsh rim light, motion blur on the edges, 8k resolution --ar 16:9 --v 6.0" },
    { id: "img_sb_noir", label: "黑色电影侦探 (Film Noir)", value: "Low angle medium shot, high-contrast black and white, harsh Venetian blind shadows, gobo lighting, classic Film Noir, 1940s detective movie aesthetic, gritty, suspenseful, heavy 35mm film grain --ar 16:9 --v 6.0" },
    { id: "img_sb_cyberpunk", label: "赛博朋克夜景 (Cyberpunk)", value: "Establishing wide shot, sprawling cyberpunk metropolis, golden hour sunlight or neon reflections in rain puddles, matte painting, highly detailed, atmospheric perspective, epic scale --ar 16:9 --stylize 400 --v 6.0" },
    { id: "img_sb_anime", label: "新海诚唯美 (Shinkai Anime)", value: "Makoto Shinkai style, breathtaking hyper-detailed twilight sky filled with falling meteors and glowing clouds, lens flares, vivid purple and pink hues, cel-shaded animation --ar 16:9 --niji 6" },
  ]
};

export const getAllPrompts = () => {
  return {
    cameras: CAMERA_MOVEMENTS,
    lenses: OPTICS_AND_LENSES,
    lighting: LIGHTING_STYLES,
    mangaGenres: MANGA_DRAMA_TROPES,
    renderQualities: RENDER_AND_MATERIAL_QUALITY,
    artStyles: ART_STYLES,
    imagePresets: IMAGE_PROMPT_PRESETS,
  };
};
