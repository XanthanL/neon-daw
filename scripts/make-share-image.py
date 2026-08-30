from PIL import Image, ImageDraw, ImageFont

F = lambda p: ImageFont.truetype(p, size=0)

def font(path, size):
    return ImageFont.truetype(path, size)

BOLD = r'C:\Windows\Fonts\arialbd.ttf'
CN = r'C:\Windows\Fonts\msyhbd.ttc'

def rounded(draw, box, r, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)

def build(w, h, out_path):
    INK = '#17171C'
    CYAN = '#00E5FF'
    PINK = '#FF3DBE'
    YELLOW = '#FFE600'
    card = Image.new('RGB', (w, h), 'white')
    d = ImageDraw.Draw(card)
    # dot grid background
    for y in range(14, h, 28):
        for x in range(14, w, 28):
            d.ellipse((x, y, x + 2, y + 2), fill='#E3E0D8')
    # sticker border
    m = max(10, w // 90)
    rounded(d, (m // 2, m // 2, w - m // 2 - 1, h - m // 2 - 1), m, outline=INK, width=m)

    title_size = int(w * 0.062)
    sub_size = int(w * 0.021)
    disc_r = int(w * 0.033)
    cx = m + disc_r + int(w * 0.035)
    cy = m + int(h * 0.13) + disc_r
    tx = cx + disc_r + int(w * 0.028)
    ty = m + int(h * 0.13)
    tag = '8 模块 · 抽卡作曲 · 节奏挑战 · 真实采样钢琴 · WAV 导出 · 免安装零后端'
    en_tag = 'A POCKET DAW IN YOUR BROWSER — SEQUENCE · ROLL · MIX · ARRANGE · EXPORT'
    limit = w - tx - m - int(w * 0.03)
    fb = font(BOLD, title_size)
    fc = font(CN, title_size)
    fs = font(BOLD, sub_size)
    fsc = font(CN, sub_size)
    # 自适应缩字：标题 = NeonDAW + 后缀
    while True:
        tw = d.textlength('NeonDAW', font=fb)
        tail_w = d.textlength('· 掌中浏览器 DAW', font=fc)
        if tw + int(w * 0.012) + tail_w <= limit or title_size < 16:
            break
        title_size -= 2
        fb = font(BOLD, title_size)
        fc = font(CN, title_size)
    while True:
        if d.textlength(tag, font=fsc) <= limit or sub_size < 9:
            break
        sub_size -= 1
        fs = font(BOLD, sub_size)
        fsc = font(CN, sub_size)
    while d.textlength(en_tag, font=fs) > limit and sub_size > 8:
        sub_size -= 1
        fs = font(BOLD, sub_size)

    # disc logo: circle + ring + center
    d.ellipse((cx - disc_r, cy - disc_r, cx + disc_r, cy + disc_r), fill='white', outline=INK, width=max(3, disc_r // 8))
    ir = int(disc_r * 0.42)
    d.ellipse((cx - ir, cy - ir, cx + ir, cy + ir), outline=CYAN, width=max(3, disc_r // 8))

    d.text((tx, ty), 'NeonDAW', font=fb, fill=INK)
    d.text((tx + tw + int(w * 0.012), ty + int(title_size * 0.18)), '· 掌中浏览器 DAW', font=fc, fill=INK)
    d.text((tx, ty + int(title_size * 1.25)), tag, font=fsc, fill='#5A5A64')
    d.text((tx, ty + int(title_size * 1.25) + int(sub_size * 1.7)), en_tag, font=fs, fill='#9A9AA4')

    # screenshots: fit two 1280x860 into lower area
    pad = int(w * 0.035)
    bottom_m = m + int(h * 0.045)
    top = ty + title_size + int(h * 0.14)
    area_h = h - top - bottom_m - pad // 2
    shots = ['screenshots/home-desktop.png', 'screenshots/rack-desktop.png']
    cols = 2 if w >= 1000 else 1
    if cols == 2:
        cell_w = (w - 2 * pad - int(w * 0.025)) // 2
        cell_h = area_h
        # fit preserving aspect (1280x860)
        sc = min(cell_w / 1280, cell_h / 860)
        iw, ih = int(1280 * sc), int(860 * sc)
        for i, s in enumerate(shots):
            im = Image.open(s).convert('RGB').resize((iw, ih), Image.LANCZOS)
            x = pad + i * (cell_w + int(w * 0.025)) + (cell_w - iw) // 2
            y = top + (cell_h - ih) // 2
            shadow = max(4, int(w * 0.008))
            d.rectangle((x + shadow, y + shadow, x + iw + shadow, y + ih + shadow), fill=INK)
            rounded(d, (x - 3, y - 3, x + iw + 3, y + ih + 3), 14, outline=INK, width=max(3, int(w * 0.004)))
            card.paste(im, (x, y))
        # accent pills top-right
        pw = int(w * 0.055)
        for k, col in enumerate([CYAN, PINK, YELLOW]):
            x0 = w - m - pad - pw * (3 - k) - int(w * 0.012) * (2 - k)
            y0 = m + int(h * 0.05)
            rounded(d, (x0, y0, x0 + pw, y0 + int(pw * 0.42)), int(pw * 0.21), fill=col, outline=INK, width=max(2, int(w * 0.0025)))
    else:
        im = Image.open(shots[0]).convert('RGB')
        sc = min((w - 2 * pad) / 1280, area_h / 860)
        iw, ih = int(1280 * sc), int(860 * sc)
        x = (w - iw) // 2
        y = top + (area_h - ih) // 2
        shadow = max(4, int(w * 0.012))
        d.rectangle((x + shadow, y + shadow, x + iw + shadow, y + ih + shadow), fill=INK)
        rounded(d, (x - 4, y - 4, x + iw + 4, y + ih + 4), 18, outline=INK, width=max(4, int(w * 0.006)))
        card.paste(im, (x, y))
    card.save(out_path, optimize=True)
    print(out_path, card.size)

build(1280, 640, 'public/share/og-1280x640.png')
build(800, 800, 'public/share/og-square.png')
