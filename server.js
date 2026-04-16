/**
 * ════════════════════════════════════════════════════
 *  مقطّع الفيديو — الخادم المحسّن v2.0
 *  Video Maker Backend — Enhanced
 * ════════════════════════════════════════════════════
 */

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3001;

// ── Directories ──────────────────────────────────────
const TMP_DIR = path.join(__dirname, "tmp");
const OUTPUT_DIR = path.join(__dirname, "output");
const UPLOAD_DIR = path.join(__dirname, "uploads");

[TMP_DIR, OUTPUT_DIR, UPLOAD_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true, mode: 0o777 });
  try {
    fs.chmodSync(d, 0o777);
  } catch (e) {
    console.warn(`⚠️ Cannot chmod ${d}:`, e.message);
  }
});

// ══════════════════════════════════════════════════════
//  CORS — مفتوح للكل
// ══════════════════════════════════════════════════════
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.options("*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.status(200).end();
});

// ── باقي Middleware ──────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use("/output", express.static(OUTPUT_DIR));
app.use("/uploads", express.static(UPLOAD_DIR));

// ── Multer ────────────────────────────────────────────
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = /\.(jpg|jpeg|png|webp|mp4|mov|webm)$/i.test(file.originalname);
    cb(ok ? null : new Error("نوع الملف غير مدعوم"), ok);
  },
});

// ── Background colour presets ─────────────────────────
const BG_PRESETS = {
  "islamic-dark": { from: "0a1628", to: "1a3a2a" },
  "deep-ocean": { from: "000814", to: "003566" },
  emerald: { from: "0d2b1a", to: "1a4a2e" },
  "desert-dusk": { from: "2d1b0e", to: "4a2c0a" },
  midnight: { from: "0d0221", to: "190d3a" },
  "dark-slate": { from: "0f172a", to: "1e293b" },
  "warm-black": { from: "0c0a09", to: "1c1917" },
  "islamic-green": { from: "052e16", to: "14532d" },
};

// ── Helpers ───────────────────────────────────────────
const toSec = (t = "") => {
  const p = t.split(":").map(Number);
  if (p.some(isNaN)) return 0;
  return p.length === 3
    ? p[0] * 3600 + p[1] * 60 + p[2]
    : p.length === 2
      ? p[0] * 60 + p[1]
      : p[0];
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${cmd} ${args.slice(0, 5).join(" ")}...`);

    execFile(
      cmd,
      args,
      { maxBuffer: 200 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          const exitCode = err.code;
          const lastLines = (stderr || "")
            .split("\n")
            .filter((l) => l.trim())
            .slice(-10)
            .join("\n");

          console.error(`❌ ${cmd} failed with exit code ${exitCode}`);
          console.error(`Last lines:\n${lastLines}`);

          const realError = (stderr || "")
            .split("\n")
            .filter(
              (l) =>
                l.includes("Error") ||
                l.includes("error") ||
                l.includes("No such file") ||
                l.includes("Permission denied") ||
                l.includes("Invalid") ||
                l.includes("Unrecognized") ||
                l.includes("not found"),
            )
            .join("\n");

          if (exitCode === null) {
            return reject(
              `${cmd} was killed (out of memory). Try shorter clip or lower quality.`,
            );
          }
          return reject(realError || `${cmd} exited with code ${exitCode}`);
        }
        resolve(stdout.trim());
      },
    );
  });

const runYtDlp = async (args, opts = {}) => {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      args,
      { maxBuffer: 100 * 1024 * 1024, ...opts },
      (err, stdout, stderr) => {
        if (err) {
          console.error("❌ yt-dlp error:", stderr || err.message);
          return reject(stderr || err.message);
        }
        resolve(stdout.trim());
      },
    );
  });
};

const safeUnlink = (...files) =>
  files.forEach((f) => f && fs.existsSync(f) && fs.unlink(f, () => {}));

const escText = (s) =>
  (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/$$/g, "\\[")
    .replace(/$$/g, "\\]");

// مسارات الخطوط — Linux
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const FONT_ARABIC = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

// ── Cookies support ───────────────────────────────────
const COOKIES_PATH = path.join(__dirname, "cookies.txt");

// لو فيه env variable — اكتبه كملف
if (process.env.COOKIES_CONTENT && !fs.existsSync(COOKIES_PATH)) {
  try {
    fs.writeFileSync(COOKIES_PATH, process.env.COOKIES_CONTENT, "utf-8");
    console.log("🍪 cookies.txt created from environment variable");
  } catch (e) {
    console.error("❌ Failed to write cookies.txt:", e.message);
  }
}

const hasCookies = fs.existsSync(COOKIES_PATH);
const cookieArgs = hasCookies ? ["--cookies", COOKIES_PATH] : [];

if (hasCookies) {
  console.log("🍪 cookies.txt found — will use for YouTube requests");
} else {
  console.log("⚠️ No cookies.txt — YouTube may block some requests");
}

// ── Common yt-dlp args ────────────────────────────────
const COMMON_YT_ARGS = [
  "--extractor-args",
  "youtube:player_client=tv,web",
  "--user-agent",
  "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
  "--no-check-certificates",
  "--remote-components", "ejs:github",
];

// ── VTT → SRT ─────────────────────────────────────────
function vttToSrt(vttText) {
  let counter = 1;
  const lines = vttText.split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length && !lines[i].includes("-->")) i++;
  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("-->")) {
      const timing = line
        .replace(/\./g, ",")
        .replace(/<[^>]+>/g, "")
        .trim();
      out.push(String(counter++));
      out.push(timing);
      i++;
      const textLines = [];
      while (i < lines.length && lines[i].trim() !== "") {
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

// ── SRT → ASS ─────────────────────────────────────────
function srtToAss(srtText, opts = {}) {
  const {
    fontSize = 52,
    color = "FFFFFF",
    bgColor = "80000000",
    style = "center-box",
    position = "bottom",
  } = opts;

  const align = style === "center-box" ? 5 : position === "top" ? 8 : 2;
  const marginV = style === "center-box" ? 920 : position === "top" ? 80 : 60;

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
//  FFmpeg Args Builder — Memory Optimized
// ════════════════════════════════════════════════════
function buildFFmpegArgs({
  rawFile,
  outputFile,
  bgType = "none",
  bgColor = "#0a1628",
  bgPreset = "islamic-dark",
  bgImagePath = null,
  bgVideoPath = null,
  bgBlur = 0,
  bgBrightness = 1,
  videoScale = 85,
  videoPosition = "center",
  videoGlow = false,
  subtitleFile = null,
  subtitleStyle = "none",
  watermarkText = "",
  overlayText = "",
  overlayPos = "bottom",
  speakerName = "",
  speakerTitle = "",
  muteAudio = false,
  audioOnly = false,
}) {
  const args = ["-y"];

  // لو مفيش خلفية — نعمل أبسط أمر ممكن
  if (bgType === "none") {
    args.push("-i", rawFile);

    // scale بسيط بدون filter_complex
    const vidW = Math.round(1080 * (videoScale / 100));
    args.push(
      "-vf",
      `scale=${vidW}:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    );

    if (!muteAudio && !audioOnly) {
      args.push("-c:a", "aac", "-b:a", "128k");
    } else if (muteAudio) {
      args.push("-an");
    }

    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-threads",
      "2",
      outputFile,
    );

    console.log("📋 Simple mode (no background)");
    return args;
  }

  // ── مع خلفية — filter_complex ─────────────────────
  const W = 1080,
    H = 1920;
  let inputCount = 0;
  let bgIdx = -1,
    vidIdx = 0;

  if (bgType === "color") {
    const hex = (bgColor || "#0a1628").replace("#", "");
    args.push("-f", "lavfi", "-i", `color=c=${hex}:s=${W}x${H}:r=25:d=300`);
    bgIdx = inputCount++;
  } else if (bgType === "preset") {
    const p = BG_PRESETS[bgPreset] || BG_PRESETS["islamic-dark"];
    args.push("-f", "lavfi", "-i", `color=c=${p.from}:s=${W}x${H}:r=25:d=300`);
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

  const chains = [];
  let prevLabel = "";

  // خلفية
  let bgF = `[${bgIdx}:v]scale=${W}:${H},setsar=1`;
  if ((bgType === "image" || bgType === "video") && bgBlur > 0)
    bgF += `,boxblur=${Math.round(bgBlur * 2)}:1`;
  if ((bgType === "image" || bgType === "video") && bgBrightness !== 1)
    bgF += `,eq=brightness=${(bgBrightness - 1).toFixed(2)}`;
  chains.push(`${bgF}[bg]`);

  // فيديو
  const vidW = Math.round(W * (videoScale / 100));
  chains.push(`[${vidIdx}:v]scale=${vidW}:-2[vid_s]`);

  // موقع
  let xP = "(W-w)/2";
  let yP =
    videoPosition === "top"
      ? "100"
      : videoPosition === "bottom"
        ? "H-h-100"
        : "(H-h)/2";

  chains.push(`[bg][vid_s]overlay=x=${xP}:y=${yP}[vout]`);

  args.push("-filter_complex", chains.join(";"));
  args.push("-map", "[vout]");

  if (!muteAudio && !audioOnly) {
    args.push("-map", `${vidIdx}:a?`);
    args.push("-c:a", "aac", "-b:a", "128k");
  } else if (muteAudio) {
    args.push("-an");
  }

  args.push("-shortest");
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-threads",
    "2",
    outputFile,
  );

  console.log("📋 Filter complex:", chains.join(";"));
  return args;
}

// ════════════════════════════════════════════════════
//  API ROUTES
// ════════════════════════════════════════════════════

// ── Root ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    message: "Video Maker Backend is running!",
    version: "2.0.0",
    endpoints: [
      "/health",
      "/api/presets",
      "/api/info",
      "/api/clip",
      "/api/debug",
    ],
  });
});

// ── Health ────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    port: PORT,
  });
});

// ── Debug ─────────────────────────────────────────────
app.get("/api/debug", async (req, res) => {
  const results = {
    node: process.version,
    platform: process.platform,
    port: PORT,
    uptime: process.uptime(),
    hasCookies,
    dirs: {
      tmp: fs.existsSync(TMP_DIR),
      output: fs.existsSync(OUTPUT_DIR),
      uploads: fs.existsSync(UPLOAD_DIR),
      tmpWritable: false,
    },
    tools: {},
  };

  try {
    const testFile = path.join(TMP_DIR, "_write_test_" + Date.now());
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
    results.dirs.tmpWritable = true;
  } catch (e) {
    results.dirs.tmpWritable = false;
    results.dirs.tmpError = e.message;
  }

  try {
    const ytVer = await run("yt-dlp", ["--version"]);
    results.tools.ytdlp = { installed: true, version: ytVer };
  } catch (err) {
    results.tools.ytdlp = {
      installed: false,
      error: String(err).slice(0, 200),
    };
  }

  try {
    const ffVer = await run("ffmpeg", ["-version"]);
    results.tools.ffmpeg = { installed: true, version: ffVer.split("\n")[0] };
  } catch (err) {
    results.tools.ffmpeg = {
      installed: false,
      error: String(err).slice(0, 200),
    };
  }

  try {
    const denoVer = await run("deno", ["--version"]);
    results.tools.deno = { installed: true, version: denoVer.split("\n")[0] };
  } catch (err) {
    results.tools.deno = { installed: false, error: String(err).slice(0, 200) };
  }

  res.json(results);
});

// ── Debug yt-dlp test ─────────────────────────────────
app.post("/api/debug/ytdlp", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "الرابط مطلوب" });

  try {
    const json = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      ...COMMON_YT_ARGS,
      "--paths",
      TMP_DIR,
      url,
    ]);
    res.json({ success: true, dataLength: json.length });
  } catch (err) {
    res.json({ success: false, error: String(err).slice(0, 500) });
  }
});

// ── Debug ffmpeg test ─────────────────────────────────
app.post("/api/debug/ffmpeg", async (req, res) => {
  const testFile = path.join(TMP_DIR, "test_input.mp4");
  const testOutput = path.join(TMP_DIR, "test_output.mp4");

  try {
    await runYtDlp([
      "-f",
      "best[height<=360][ext=mp4]/best",
      "--download-sections",
      "*0:00-0:05",
      "--force-keyframes-at-cuts",
      "--merge-output-format",
      "mp4",
      ...COMMON_YT_ARGS,
      "--no-playlist",
      "--paths",
      TMP_DIR,
      "--output",
      "test_input.mp4",
      req.body.url || "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]);

    const simpleArgs = [
      "-y",
      "-i",
      testFile,
      "-t",
      "5",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      testOutput,
    ];

    await run("ffmpeg", simpleArgs);

    const exists = fs.existsSync(testOutput);
    const size = exists ? fs.statSync(testOutput).size : 0;
    safeUnlink(testFile, testOutput);

    res.json({
      success: true,
      outputExists: exists,
      outputSize: size,
      message: "ffmpeg works!",
    });
  } catch (err) {
    safeUnlink(testFile, testOutput);
    res.json({ success: false, error: String(err).slice(-800) });
  }
});

// ── Debug filter_complex test ─────────────────────────
app.post("/api/debug/filter", async (req, res) => {
  const testFile = path.join(TMP_DIR, "test_filter_input.mp4");
  const testOutput = path.join(TMP_DIR, "test_filter_output.mp4");

  try {
    await runYtDlp([
      "-f",
      "best[height<=360][ext=mp4]/best",
      "--download-sections",
      "*0:00-0:05",
      "--force-keyframes-at-cuts",
      "--merge-output-format",
      "mp4",
      ...COMMON_YT_ARGS,
      "--no-playlist",
      "--paths",
      TMP_DIR,
      "--output",
      "test_filter_input.mp4",
      req.body.url || "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ]);

    const filterArgs = [
      "-y",
      "-i",
      testFile,
      "-filter_complex",
      "[0:v]scale=918:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[vout]",
      "-map",
      "[vout]",
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-t",
      "5",
      testOutput,
    ];

    await run("ffmpeg", filterArgs);

    const exists = fs.existsSync(testOutput);
    const size = exists ? fs.statSync(testOutput).size : 0;
    safeUnlink(testFile, testOutput);

    res.json({
      success: true,
      outputExists: exists,
      outputSize: size,
      message: "filter_complex works!",
    });
  } catch (err) {
    safeUnlink(testFile, testOutput);
    res.json({ success: false, error: String(err).slice(-800) });
  }
});

// ── Presets ───────────────────────────────────────────
app.get("/api/presets", (_, res) => {
  res.json({
    backgrounds: Object.entries(BG_PRESETS).map(([id, { from, to }]) => ({
      id,
      from: `#${from}`,
      to: `#${to}`,
    })),
  });
});

// ── Info ──────────────────────────────────────────────
app.post("/api/info", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "الرابط مطلوب" });
  try {
    const json = await runYtDlp([
      "--dump-json",
      "--no-playlist",
      ...COMMON_YT_ARGS,
      "--paths",
      TMP_DIR,
      url,
    ]);

    const d = JSON.parse(json);
    res.json({
      title: d.title,
      thumbnail: d.thumbnail,
      duration: d.duration,
      durationStr: d.duration_string,
      channel: d.uploader,
      hasSubtitles: !!(d.subtitles && Object.keys(d.subtitles).length > 0),
      availableLangs: Object.keys(d.subtitles || {}),
      formats: (d.formats || [])
        .filter((f) => f.height)
        .map((f) => ({ id: f.format_id, quality: `${f.height}p`, ext: f.ext }))
        .filter((v, i, s) => s.findIndex((t) => t.quality === v.quality) === i)
        .sort((a, b) => parseInt(b.quality) - parseInt(a.quality)),
    });
  } catch (err) {
    console.error("❌ Error fetching video info:", err);
    res.status(500).json({ error: "تعذّر جلب معلومات الفيديو" });
  }
});

// ── Transcript ────────────────────────────────────────
app.post("/api/transcript", async (req, res) => {
  const { url, lang = "ar" } = req.body;
  if (!url) return res.status(400).json({ error: "الرابط مطلوب" });

  const jobId = uuidv4();
  const subBase = path.join(TMP_DIR, `${jobId}_sub`);

  try {
    await runYtDlp([
      "--write-subs",
      "--write-auto-subs",
      "--sub-lang",
      `${lang},${lang === "ar" ? "en" : "ar"}`,
      "--sub-format",
      "vtt/srt",
      ...COMMON_YT_ARGS,
      "--skip-download",
      "--no-playlist",
      "-o",
      subBase,
      url,
    ]).catch(() => {});

    const files = fs
      .readdirSync(TMP_DIR)
      .filter(
        (f) => f.startsWith(path.basename(subBase)) && /\.(vtt|srt)$/i.test(f),
      );

    if (files.length === 0)
      return res.json({ transcript: null, message: "لا توجد ترجمة متاحة" });

    const preferred = files.find((f) => f.includes(`.${lang}.`)) || files[0];
    const subPath = path.join(TMP_DIR, preferred);
    let content = fs.readFileSync(subPath, "utf-8");
    if (preferred.endsWith(".vtt")) content = vttToSrt(content);

    const srtPath = subBase + ".srt";
    fs.writeFileSync(srtPath, content, "utf-8");

    const cleanText = content
      .replace(/^\d+$/gm, "")
      .replace(/\d{2}:\d{2}:\d{2},\d{3} --> .*/g, "")
      .replace(/<[^>]+>/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join(" ");

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

// ── Upload Background ─────────────────────────────────
app.post("/api/upload-bg", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "لم يُرفق ملف" });
  const isVideo = /\.(mp4|mov|webm)$/i.test(req.file.originalname);
  res.json({
    path: req.file.path,
    url: `/uploads/${req.file.filename}`,
    type: isVideo ? "video" : "image",
  });
});

// ── Clip ──────────────────────────────────────────────
app.post("/api/clip", async (req, res) => {
  const {
    url,
    startTime,
    endTime,
    quality = "720",
    muteAudio = false,
    audioOnly = false,
    bgType = "none",
    bgColor = "#0a1628",
    bgPreset = "islamic-dark",
    bgImagePath = null,
    bgVideoPath = null,
    bgBlur = 0,
    bgBrightness = 1,
    videoScale = 85,
    videoPosition = "center",
    videoGlow = false,
    subtitleStyle = "none",
    subtitleLang = "ar",
    srtJobId = null,
    watermarkText = "",
    overlayText = "",
    overlayPos = "bottom",
    speakerName = "",
    speakerTitle = "",
    outputFormat = "reels",
  } = req.body;

  if (!url || !startTime || !endTime)
    return res
      .status(400)
      .json({ error: "الرابط ووقت البداية والنهاية مطلوبة" });

  const startSec = toSec(startTime);
  const endSec = toSec(endTime);
  if (endSec <= startSec)
    return res
      .status(400)
      .json({ error: "وقت النهاية يجب أن يكون بعد وقت البداية" });

  const jobId = uuidv4();
  const rawFilename = `${jobId}_raw.mp4`;
  const rawFile = path.join(TMP_DIR, rawFilename);
  const outputFile = path.join(OUTPUT_DIR, `${jobId}_reel.mp4`);
  let assFile = null;

  try {
    // 1️⃣ تحميل مقطع الفيديو
    const ytArgs = [
      "-f",
      audioOnly
        ? "bestaudio[ext=m4a]/bestaudio"
        : `best[height<=${quality}][ext=mp4]/bestvideo[height<=${quality}]+bestaudio/best`,
      "--download-sections",
      `*${startTime}-${endTime}`,
      "--force-keyframes-at-cuts",
      "--merge-output-format",
      "mp4",
      ...COMMON_YT_ARGS,
      "--no-playlist",
      "--paths",
      TMP_DIR,
      "--output",
      rawFilename,
      url,
    ];
    await runYtDlp(ytArgs);

    // 2️⃣ تحضير ملف الترجمة (ASS)
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

    // 3️⃣ بناء وتنفيذ أوامر ffmpeg
    const ffArgs = buildFFmpegArgs({
      rawFile,
      outputFile,
      bgType,
      bgColor,
      bgPreset,
      bgImagePath,
      bgVideoPath,
      bgBlur: Number(bgBlur),
      bgBrightness: Number(bgBrightness),
      videoScale: Number(videoScale),
      videoPosition,
      videoGlow,
      subtitleFile: assFile,
      subtitleStyle,
      watermarkText,
      overlayText,
      overlayPos,
      speakerName,
      speakerTitle,
      muteAudio,
      audioOnly,
    });

    console.log("▶ ffmpeg args count:", ffArgs.length);
    console.log("▶ Input file exists:", fs.existsSync(rawFile));
    console.log(
      "▶ Input file size:",
      fs.existsSync(rawFile) ? fs.statSync(rawFile).size : 0,
    );

    try {
      await run("ffmpeg", ffArgs);
      console.log("✅ ffmpeg completed successfully");
      console.log("✅ Output exists:", fs.existsSync(outputFile));
      console.log(
        "✅ Output size:",
        fs.existsSync(outputFile) ? fs.statSync(outputFile).size : 0,
      );
    } catch (ffErr) {
      console.error("❌ FFmpeg Error:", ffErr);
      throw new Error(String(ffErr).slice(0, 500));
    }

    // تنظيف الملفات المؤقتة
    safeUnlink(rawFile, assFile);

    res.json({
      jobId,
      downloadUrl: `/output/${jobId}_reel.mp4`,
      filename: `reel_${outputFormat}_${startTime.replace(/:/g, "-")}.mp4`,
    });
  } catch (err) {
    console.error(err);
    safeUnlink(rawFile, assFile, outputFile);
    res
      .status(500)
      .json({ error: `خطأ في المعالجة: ${String(err).slice(0, 300)}` });
  }
});

// ── Delete Clip ───────────────────────────────────────
app.delete("/api/clip/:jobId", (req, res) => {
  const file = path.join(OUTPUT_DIR, `${req.params.jobId}_reel.mp4`);
  safeUnlink(file);
  res.json({ ok: true });
});

// ── تشغيل الخادم ─────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`   Directories: tmp=${TMP_DIR} | output=${OUTPUT_DIR}`);
  console.log(`   Cookies: ${hasCookies ? "✅ loaded" : "❌ not found"}`);
});
