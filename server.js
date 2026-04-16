/**
 * ════════════════════════════════════════════════════
 *  مقطّع الفيديو — الخادم المحسّن v2.0
 *  Video Maker Backend — Enhanced
 *  yt-dlp + ffmpeg: background composition, subtitles,
 *  speaker cards, layout control, reel optimization
 * ════════════════════════════════════════════════════
 */

const express = require("express");
const cors    = require("cors");
const multer  = require("multer");
const fs      = require("fs");
const path    = require("path");
const { execFile, exec } = require("child_process");
const { v4: uuidv4 } = require("uuid");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Directories ──────────────────────────────────────
const TMP_DIR    = path.join(__dirname, "tmp");
const OUTPUT_DIR = path.join(__dirname, "output");
const UPLOAD_DIR = path.join(__dirname, "uploads");
[TMP_DIR, OUTPUT_DIR, UPLOAD_DIR].forEach(
  (d) => !fs.existsSync(d) && fs.mkdirSync(d, { recursive: true })
);

// ── Middleware ────────────────────────────────────────
app.use(cors({ 
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true 
}));
app.use(express.json({ limit: "10mb" }));
app.use("/output",  express.static(OUTPUT_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// ── Multer (background uploads) ───────────────────────
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|mp4|mov|webm)$/i.test(file.originalname);
    cb(ok ? null : new Error("نوع الملف غير مدعوم"), ok);
  },
});

// ── Background colour presets ─────────────────────────
const BG_PRESETS = {
  "islamic-dark":  { from: "0a1628", to: "1a3a2a" },
  "deep-ocean":    { from: "000814", to: "003566" },
  "emerald":       { from: "0d2b1a", to: "1a4a2e" },
  "desert-dusk":   { from: "2d1b0e", to: "4a2c0a" },
  "midnight":      { from: "0d0221", to: "190d3a" },
  "dark-slate":    { from: "0f172a", to: "1e293b" },
  "warm-black":    { from: "0c0a09", to: "1c1917" },
  "islamic-green": { from: "052e16", to: "14532d" },
};

// ── Helpers ───────────────────────────────────────────
const toSec = (t = "") => {
  const p = t.split(":").map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2]
       : p.length === 2 ? p[0] * 60 + p[1] : p[0];
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 100 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout.trim());
    });
  });

// Special handler for yt-dlp using exec and full path
const runYtDlp = async (args, opts = {}) => {
  const ytdlpPath = "C:\\Users\\Sherif Dahy\\AppData\\Roaming\\Python\\Python314\\Scripts\\yt-dlp.exe";
  const argStr = args.map(a => `"${a}"`).join(" ");
  const cmd = `"${ytdlpPath}" ${argStr}`;
  
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 100 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        console.error("❌ yt-dlp error:", stderr || err.message);
        return reject(stderr || err.message);
      }
      resolve(stdout.trim());
    });
  });
};

const safeUnlink = (...files) =>
  files.forEach((f) => f && fs.existsSync(f) && fs.unlink(f, () => {}));

/** Escape text for ffmpeg drawtext filter (Windows-safe) */
const escText = (s) =>
  (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")   // replace smart quote
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");

/** Windows font path for ffmpeg */
const FONT = "C\\\\:/Windows/Fonts/arial.ttf";
const FONT_ARABIC = "C\\\\:/Windows/Fonts/tahoma.ttf";

// ── VTT → SRT converter ───────────────────────────────
function vttToSrt(vttText) {
  let counter = 1;
  const lines = vttText.split(/\r?\n/);
  const out   = [];
  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes("-->")) i++;

  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("-->")) {
      // Normalise timestamps: VTT uses . while SRT uses ,
      const timing = line.replace(/\./g, ",").replace(/<[^>]+>/g, "").trim();
      out.push(String(counter++));
      out.push(timing);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
        // Strip VTT tags
        textLines.push(lines[i].replace(/<[^>]+>/g, "").trim());
        i++;
      }
      out.push(textLines.join("\n"));
      out.push("");
    } else {
      i++;
    }
  }
  return out.join("\n");
}

// ── SRT → ASS converter (Arabic-optimised) ───────────
function srtToAss(srtText, opts = {}) {
  const {
    fontSize   = 52,
    color      = "FFFFFF",
    bgColor    = "80000000",
    style      = "center-box",
    position   = "bottom",
  } = opts;

  const align = style === "center-box" ? 5 : (position === "top" ? 8 : 2);
  const marginV = style === "center-box" ? 920 : (position === "top" ? 80 : 60);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Tahoma,${fontSize},&H00${color},&H000000FF,&H00000000,&H${bgColor},-1,0,0,0,100,100,2,0,3,3,0,${align},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const toAssTime = (t) => {
    // "00:00:01,000" -> "0:00:01.00"
    const [hms, ms] = t.split(",");
    const [h, m, s] = hms.split(":");
    return `${parseInt(h)}:${m}:${s}.${(ms || "000").slice(0, 2)}`;
  };

  const blocks = srtText.trim().split(/\n\n+/);
  const events = blocks
    .map((block) => {
      const blines = block.split(/\n/);
      const timeLine = blines.find((l) => l.includes("-->"));
      if (!timeLine) return null;
      const [start, end] = timeLine.split("-->").map((t) => t.trim());
      const text = blines
        .filter((l) => l && !l.includes("-->") && !/^\d+$/.test(l.trim()))
        .join("\\N");
      return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Default,,0,0,0,,${text}`;
    })
    .filter(Boolean);

  return header + events.join("\n");
}

// ════════════════════════════════════════════════════
//  BUILD FFMPEG FILTER GRAPH
// ════════════════════════════════════════════════════
function buildFFmpegArgs({
  rawFile, outputFile,
  bgType = "none", bgColor = "#0a1628", bgPreset = "islamic-dark",
  bgImagePath = null, bgVideoPath = null,
  bgBlur = 0, bgBrightness = 1,
  videoScale = 85, videoPosition = "center",
  videoGlow = false,
  subtitleFile = null, subtitleStyle = "none",
  watermarkText = "", overlayText = "", overlayPos = "bottom",
  speakerName = "", speakerTitle = "",
  muteAudio = false, audioOnly = false,
}) {
  const W = 1080, H = 1920;
  const args = ["-y"];
  let inputCount = 0;
  let bgIdx = -1, vidIdx = 0;

  // ── Inputs ────────────────────────────────────────
  if (bgType === "color") {
    const hex = (bgColor || "#0a1628").replace("#", "");
    args.push("-f", "lavfi", "-i", `color=c=${hex}:s=${W}x${H}:r=30`);
    bgIdx = inputCount++;
  } else if (bgType === "preset") {
    const p = BG_PRESETS[bgPreset] || BG_PRESETS["islamic-dark"];
    // Use the 'from' color as solid background (ffmpeg lavfi)
    args.push("-f", "lavfi", "-i", `color=c=${p.from}:s=${W}x${H}:r=30`);
    bgIdx = inputCount++;
  } else if (bgType === "image" && bgImagePath) {
    args.push("-loop", "1", "-i", bgImagePath);
    bgIdx = inputCount++;
  } else if (bgType === "video" && bgVideoPath) {
    args.push("-stream_loop", "-1", "-i", bgVideoPath);
    bgIdx = inputCount++;
  }

  args.push("-i", rawFile);
  vidIdx = inputCount++;

  // ── Filter Graph ──────────────────────────────────
  const chains = [];
  let prevLabel = "";

  // 1. Background layer
  if (bgIdx >= 0) {
    let bgF = `[${bgIdx}:v]scale=${W}:${H},setsar=1`;
    if ((bgType === "image" || bgType === "video") && bgBlur > 0) {
      bgF += `,boxblur=${Math.round(bgBlur * 2)}:1`;
    }
    if ((bgType === "image" || bgType === "video") && bgBrightness !== 1) {
      bgF += `,eq=brightness=${(bgBrightness - 1).toFixed(2)}`;
    }
    chains.push(`${bgF}[bg]`);

    // 2. Scale main video
    const vidW = Math.round(W * (videoScale / 100));
    chains.push(`[${vidIdx}:v]scale=${vidW}:-2[vid_s]`);

    // 3. Overlay position
    let xP = "(W-w)/2";
    let yP = videoPosition === "top"    ? "100"
           : videoPosition === "bottom" ? "H-h-100"
           :                             "(H-h)/2";

    // 4. Glow effect
    if (videoGlow) {
      chains.push(`[vid_s]split[vid_a][vid_b]`);
      chains.push(`[vid_b]scale=iw+30:ih+30,boxblur=12:1,colorchannelmixer=aa=0.6[glow]`);
      chains.push(`[bg][glow]overlay=x=${xP}-15:y=${yP}-15[bg_g]`);
      chains.push(`[bg_g][vid_a]overlay=x=${xP}:y=${yP}[comp0]`);
    } else {
      chains.push(`[bg][vid_s]overlay=x=${xP}:y=${yP}[comp0]`);
    }
    prevLabel = "comp0";
  } else {
    // No background — pad to 1080×1920
    const vidW = Math.round(W * (videoScale / 100));
    chains.push(`[${vidIdx}:v]scale=${vidW}:-2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black[comp0]`);
    prevLabel = "comp0";
  }

  // 5. Burn subtitles (ASS)
  if (subtitleFile && subtitleStyle !== "none") {
    const subPath = subtitleFile.replace(/\\/g, "/").replace(/:/g, "\\:");
    chains.push(`[${prevLabel}]ass='${subPath}'[comp1]`);
    prevLabel = "comp1";
  }

  // 6. Text overlays (chained drawtext filters on a single video stream)
  const textDraws = [];

  if (watermarkText) {
    textDraws.push(
      `drawtext=fontfile='${FONT_ARABIC}':text='${escText(watermarkText)}':fontsize=26:fontcolor=white@0.8:x=20:y=20:shadowcolor=black@0.9:shadowx=2:shadowy=2`
    );
  }

  if (overlayText) {
    const yTxt = overlayPos === "top" ? "100" : "h-th-100";
    textDraws.push(
      `drawtext=fontfile='${FONT_ARABIC}':text='${escText(overlayText)}':fontsize=40:fontcolor=white:x=(w-tw)/2:y=${yTxt}:box=1:boxcolor=0x00000088:boxborderw=16:line_spacing=6`
    );
  }

  if (speakerName) {
    textDraws.push(
      `drawtext=fontfile='${FONT_ARABIC}':text='${escText(speakerName)}':fontsize=42:fontcolor=white:x=(w-tw)/2:y=h-240:box=1:boxcolor=0x00000099:boxborderw=18`
    );
    if (speakerTitle) {
      textDraws.push(
        `drawtext=fontfile='${FONT_ARABIC}':text='${escText(speakerTitle)}':fontsize=28:fontcolor=0xcccccc:x=(w-tw)/2:y=h-175:box=1:boxcolor=0x00000077:boxborderw=12`
      );
    }
  }

  const finalLabel = "vout";
  if (textDraws.length > 0) {
    chains.push(`[${prevLabel}]${textDraws.join(",")}[${finalLabel}]`);
  } else {
    // rename last label
    const last = chains.pop();
    chains.push(last.replace(`[${prevLabel}]`, `[${prevLabel}]`).replace(new RegExp(`\\[${prevLabel}\\]$`), `[${finalLabel}]`));
  }

  // ── Assemble args ─────────────────────────────────
  args.push("-filter_complex", chains.join(";"));
  args.push("-map", `[${finalLabel}]`);

  if (!muteAudio && !audioOnly) {
    args.push("-map", `${vidIdx}:a?`);
    args.push("-c:a", "aac", "-b:a", "128k");
  } else if (muteAudio) {
    args.push("-an");
  }

  if (bgIdx >= 0) args.push("-shortest");

  args.push(
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputFile
  );

  return args;
}

// ════════════════════════════════════════════════════
//  API ROUTES
// ════════════════════════════════════════════════════

// ── GET /api/presets ──────────────────────────────────
app.get("/api/presets", (_, res) => {
  res.json({
    backgrounds: Object.entries(BG_PRESETS).map(([id, { from, to }]) => ({
      id, from: `#${from}`, to: `#${to}`,
    })),
  });
});

// ── POST /api/info ────────────────────────────────────
app.post("/api/info", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "الرابط مطلوب" });
  try {
    const json = await runYtDlp([
      "--dump-json", "--no-playlist",
      "--extractor-args", "youtube:skip=hls/manifest,dash/manifest",
      "--remote-components", "ejs:github",
      "--js-runtimes", "node",
      "--user-agent", "Mozilla/5.0",
      url,
    ]);
    
    const d = JSON.parse(json);
    res.json({
      title:       d.title,
      thumbnail:   d.thumbnail,
      duration:    d.duration,
      durationStr: d.duration_string,
      channel:     d.uploader,
      hasSubtitles: !!(d.subtitles && Object.keys(d.subtitles).length > 0),
      availableLangs: Object.keys(d.subtitles || {}),
      formats: (d.formats || [])
        .filter((f) => f.height && f.vcodec !== "none")
        .map((f) => ({ id: f.format_id, quality: `${f.height}p`, ext: f.ext }))
        .filter((v, i, s) => s.findIndex((t) => t.quality === v.quality) === i)
        .sort((a, b) => parseInt(b.quality) - parseInt(a.quality)),
    });
  } catch (err) {
    console.error("❌ Error fetching video info:", err.message);
    res.status(500).json({ error: "تعذّر جلب معلومات الفيديو. تأكد من صحة الرابط وأن yt-dlp مثبتة." });
  }
});

// ── POST /api/transcript ──────────────────────────────
app.post("/api/transcript", async (req, res) => {
  const { url, lang = "ar" } = req.body;
  if (!url) return res.status(400).json({ error: "الرابط مطلوب" });

  const jobId   = uuidv4();
  const subBase = path.join(TMP_DIR, `${jobId}_sub`);

  try {
    // Try official subs first, then auto-generated
    await runYtDlp([
      "--write-subs", "--write-auto-subs",
      "--sub-lang", `${lang},${lang === "ar" ? "en" : "ar"}`,
      "--sub-format", "vtt/srt",
      "--extractor-args", "youtube:skip=hls/manifest,dash/manifest",
      "--remote-components", "ejs:github",
      "--js-runtimes", "node",
      "--skip-download", "--no-playlist",
      "--user-agent", "Mozilla/5.0",
      "-o", subBase,
      url,
    ]).catch(() => {}); // ignore errors — subs might not exist

    // Find downloaded subtitle file
    const files = fs.readdirSync(TMP_DIR).filter(
      (f) => f.startsWith(path.basename(subBase)) && /\.(vtt|srt)$/i.test(f)
    );

    if (files.length === 0) {
      return res.json({ transcript: null, message: "لا توجد ترجمة متاحة لهذا الفيديو" });
    }

    // Pick preferred language
    const preferred =
      files.find((f) => f.includes(`.${lang}.`)) || files[0];
    const subPath = path.join(TMP_DIR, preferred);
    let content   = fs.readFileSync(subPath, "utf-8");

    // Convert VTT to SRT if needed
    if (preferred.endsWith(".vtt")) {
      content = vttToSrt(content);
    }

    // Save as SRT for later use
    const srtPath = subBase + ".srt";
    fs.writeFileSync(srtPath, content, "utf-8");

    // Clean transcript text for display
    const cleanText = content
      .replace(/^\d+$/gm, "")
      .replace(/\d{2}:\d{2}:\d{2},\d{3} --> .*/g, "")
      .replace(/<[^>]+>/g, "")
      .split("\n").map((l) => l.trim()).filter(Boolean)
      .join(" ");

    // Cleanup temp vtt/srt originals
    files.forEach((f) => safeUnlink(path.join(TMP_DIR, f)));

    res.json({
      transcript: cleanText,
      srtJobId: jobId,
      lang: preferred.includes(`.${lang}.`) ? lang : "en",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "خطأ في استخراج الترجمة" });
  }
});

// ── POST /api/upload-bg ───────────────────────────────
app.post("/api/upload-bg", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "لم يُرفق ملف" });
  const isVideo = /\.(mp4|mov|webm)$/i.test(req.file.originalname);
  res.json({
    path: req.file.path,
    url:  `/uploads/${req.file.filename}`,
    type: isVideo ? "video" : "image",
  });
});

// ── POST /api/clip ────────────────────────────────────
app.post("/api/clip", async (req, res) => {
  const {
    url, startTime, endTime, quality = "720",
    muteAudio = false, audioOnly = false,
    bgType = "none", bgColor = "#0a1628", bgPreset = "islamic-dark",
    bgImagePath = null, bgVideoPath = null,
    bgBlur = 0, bgBrightness = 1,
    videoScale = 85, videoPosition = "center", videoGlow = false,
    subtitleStyle = "none", subtitleLang = "ar", srtJobId = null,
    watermarkText = "", overlayText = "", overlayPos = "bottom",
    speakerName = "", speakerTitle = "",
    outputFormat = "reels",
  } = req.body;

  if (!url || !startTime || !endTime)
    return res.status(400).json({ error: "الرابط ووقت البداية والنهاية مطلوبة" });

  const startSec = toSec(startTime);
  const endSec   = toSec(endTime);
  if (endSec <= startSec)
    return res.status(400).json({ error: "وقت النهاية يجب أن يكون بعد وقت البداية" });

  const jobId      = uuidv4();
  const rawFile    = path.join(TMP_DIR, `${jobId}_raw.mp4`);
  const outputFile = path.join(OUTPUT_DIR, `${jobId}_reel.mp4`);
  let   assFile    = null;

  try {
    // 1️⃣ Download clip segment
    const ytArgs = [
      "-f", audioOnly
        ? "bestaudio[ext=m4a]/bestaudio"
        : `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}]`,
      "--download-sections", `*${startTime}-${endTime}`,
      "--force-keyframes-at-cuts",
      "--merge-output-format", "mp4",
      "--extractor-args", "youtube:skip=hls/manifest,dash/manifest",
      "--remote-components", "ejs:github",
      "--js-runtimes", "node",
      "--no-playlist",
      "--user-agent", "Mozilla/5.0",
      "-o", rawFile,
      url,
    ];
    await runYtDlp(ytArgs);

    // 2️⃣ Prepare subtitle file (ASS)
    if (subtitleStyle !== "none" && srtJobId) {
      const srtPath = path.join(TMP_DIR, `${srtJobId}_sub.srt`);
      if (fs.existsSync(srtPath)) {
        const srtContent = fs.readFileSync(srtPath, "utf-8");
        const assContent = srtToAss(srtContent, {
          style: subtitleStyle,
          fontSize: 52,
          color: "FFFFFF",
          bgColor: subtitleStyle === "center-box" ? "AA000000" : "88000000",
          position: "bottom",
        });
        assFile = path.join(TMP_DIR, `${jobId}.ass`);
        fs.writeFileSync(assFile, assContent, "utf-8");
      }
    }

    // 3️⃣ Build and run ffmpeg filter graph
    const ffArgs = buildFFmpegArgs({
      rawFile, outputFile,
      bgType, bgColor, bgPreset, bgImagePath, bgVideoPath,
      bgBlur: Number(bgBlur), bgBrightness: Number(bgBrightness),
      videoScale: Number(videoScale), videoPosition, videoGlow,
      subtitleFile: assFile, subtitleStyle,
      watermarkText, overlayText, overlayPos,
      speakerName, speakerTitle,
      muteAudio, audioOnly,
    });

    console.log("▶ ffmpeg", ffArgs.join(" "));
    await run("ffmpeg", ffArgs);

    // Cleanup
    safeUnlink(rawFile, assFile);

    res.json({
      jobId,
      downloadUrl: `/output/${jobId}_reel.mp4`,
      filename:    `reel_${outputFormat}_${startTime.replace(/:/g, "-")}.mp4`,
    });
  } catch (err) {
    console.error(err);
    safeUnlink(rawFile, assFile, outputFile);
    res.status(500).json({ error: `خطأ في المعالجة: ${String(err).slice(0, 300)}` });
  }
});

// ── DELETE /api/clip/:jobId ───────────────────────────
app.delete("/api/clip/:jobId", (req, res) => {
  const file = path.join(OUTPUT_DIR, `${req.params.jobId}_reel.mp4`);
  safeUnlink(file);
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ الخادم يعمل على http://localhost:${PORT}`);
  console.log(`   المجلدات: tmp=${TMP_DIR} | output=${OUTPUT_DIR}`);
});
