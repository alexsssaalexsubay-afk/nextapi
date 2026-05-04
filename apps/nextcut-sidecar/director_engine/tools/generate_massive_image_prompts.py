import sqlite3
import random
import os

DB_PATH = "/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut-sidecar/director_engine/tools/prompt_massive_dict.db"

SUBJECTS = [
    "A cyberpunk mercenary with glowing neon tattoos and a futuristic visor",
    "A high-fantasy elven archer wearing intricate silver-threaded armor",
    "A gritty 1940s film noir detective in a trench coat and fedora",
    "A majestic ancient dragon with scales made of glowing obsidian",
    "A futuristic mecha pilot in a battered, heavily modified combat suit",
    "An ethereal immortal cultivator wearing flowing silk hanfu",
    "A post-apocalyptic survivor with a gas mask and makeshift weapons",
    "A Victorian vampire aristocrat with pale skin and crimson eyes",
    "A cute 3D Pixar-style little robot with expressive digital eyes",
    "A highly detailed anime-style high schooler under a cherry blossom tree",
    "A cold and domineering modern CEO in a bespoke three-piece Italian suit",
    "An alien diplomat from a water planet with bioluminescent skin",
    "A chaotic wasteland raider driving a spiked, rust-covered dune buggy",
    "A medieval knight templar holding a glowing broadsword",
    "A mystical woodland nymph covered in glowing moss and vines",
    "A rogue samurai wandering through a snowy mountain pass",
    "A deep-space astronaut floating outside a massive orbital station",
    "A glamorous Hollywood starlet from the 1920s under stage lights",
    "A terrifying eldritch horror with shifting, geometry-defying tentacles",
    "A cute, fluffy red panda sliding down a snowy hill"
]

ACTIONS_AND_POSES = [
    "standing tall and confident, looking directly into the camera",
    "leaping through the air in a dynamic action pose",
    "running desperately towards the viewer with an intense expression",
    "sitting quietly, lost in deep contemplation and melancholy",
    "brandishing a weapon, ready for an intense confrontation",
    "turning back over the shoulder with a mysterious smile",
    "frozen in mid-air during an acrobatic martial arts strike",
    "crouching low to the ground in a stealthy, tactical stance",
    "walking in slow motion away from a massive background explosion",
    "reaching a hand out toward the lens in a desperate plea"
]

LIGHTING = [
    "cinematic lighting, dramatic chiaroscuro, high contrast",
    "volumetric god rays piercing through dense atmospheric fog",
    "soft golden hour sunlight casting long, warm shadows",
    "harsh cyberpunk neon lighting, magenta and cyan reflections",
    "ethereal moonlight reflecting off wet surfaces",
    "moody film noir gobo lighting, venetian blind shadows",
    "flat, clean studio lighting with a pure white background",
    "bioluminescent ambient glow, magical and mysterious",
    "Rembrandt lighting with a perfect triangle of light on the cheek",
    "overcast, soft diffuse lighting, melancholic atmosphere"
]

CAMERAS = [
    "extreme wide establishing shot (EWS), 14mm lens",
    "dynamic low angle shot, making the subject look towering",
    "intense extreme close-up (ECU) on the eyes, 135mm telephoto",
    "medium tracking shot, 50mm standard lens",
    "high angle bird's-eye view, dramatic perspective",
    "Dutch angle, tilting the horizon for a sense of unease",
    "over-the-shoulder shot, shallow depth of field",
    "perfectly symmetrical Wes Anderson style frontal shot"
]

STYLES = [
    "hyper-realistic, 8k resolution, Unreal Engine 5 render, path tracing",
    "cel-shaded anime style, Studio Ghibli, Makoto Shinkai sky",
    "comic book style, halftone dots, heavy inking, Frank Miller",
    "oil painting, thick impasto brushstrokes, Rembrandt style",
    "3D Pixar/Disney style animation, subsurface scattering",
    "watercolor painting, soft blending, ethereal and dreamy",
    "vintage 1980s VHS camcorder aesthetic, tracking glitches",
    "stop-motion claymation, tactile textures, studio miniature"
]

CHARACTER_SHEET_MODIFIERS = [
    "character turnaround sheet, front view, side profile view, back view",
    "character design sheet, concept art sketches, T-pose, orthographic views",
    "multiple angles, character reference sheet, clean layout"
]

STORYBOARD_MODIFIERS = [
    "epic storyboard keyframe, cinematic aspect ratio, dramatic composition",
    "action sequence keyframe, high tension, frozen moment in time",
    "film storyboard frame, narrative focus, cinematic still"
]

def generate_prompts(count=10000):
    prompts = []
    
    # Generate Character Sheets (20%)
    for _ in range(int(count * 0.2)):
        subject = random.choice(SUBJECTS)
        modifier = random.choice(CHARACTER_SHEET_MODIFIERS)
        style = random.choice(STYLES)
        lighting = "clean studio lighting, pure white background" # Enforce clean background for sheets
        
        prompt = f"{modifier} of {subject}, {lighting}, {style} --ar 3:2 --v 6.0"
        prompts.append((prompt, "ImageGen-Character-Sheets"))
        
    # Generate Storyboard Keyframes (80%)
    for _ in range(int(count * 0.8)):
        subject = random.choice(SUBJECTS)
        action = random.choice(ACTIONS_AND_POSES)
        modifier = random.choice(STORYBOARD_MODIFIERS)
        camera = random.choice(CAMERAS)
        lighting = random.choice(LIGHTING)
        style = random.choice(STYLES)
        
        prompt = f"{modifier}. {subject}, {action}. {camera}. {lighting}. {style} --ar 16:9 --v 6.0"
        prompts.append((prompt, "ImageGen-Storyboard-Keyframes"))
        
    return prompts

def main():
    print("Generating massive corpus of high-precision image generation prompts...")
    prompts = generate_prompts(50000) # 50,000 prompts
    
    total_words = sum(len(p[0].split()) for p in prompts)
    print(f"Generated {len(prompts)} prompts containing approximately {total_words:,} words.")
    
    print("Loading into SQLite database...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.executemany("INSERT INTO prompts (prompt, source) VALUES (?, ?)", prompts)
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM prompts")
    p_count = cursor.fetchone()[0]
    
    print(f"Success! Total prompts in DB is now: {p_count:,}")
    conn.close()

if __name__ == "__main__":
    main()
