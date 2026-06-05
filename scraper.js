// scraper.js
const axios = require("axios");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

// Connect to Supabase using environment variables
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// User-Agent header to avoid being blocked
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper: scrape one category page
async function scrapeCategory(url, type) {
  try {
    const { data } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
    const $ = cheerio.load(data);
    const items = [];

    $(".ipsDataItem").each((i, el) => {
      const titleRaw = $(el).find(".ipsDataItem_title a").text().trim();
      const link = $(el).find(".ipsDataItem_title a").attr("href");
      if (titleRaw && link) {
        const name = titleRaw.split("(")[0].trim();
        items.push({
          id: Buffer.from(link).toString("base64"), // unique ID
          type,
          name,
          poster: null, // optional: you can fetch TMDB poster later
          magnet_links: [], // will be filled later if needed
          updated_at: new Date().toISOString()
        });
      }
    });

    return items;
  } catch (err) {
    console.error("Scrape error:", err.message);
    return [];
  }
}

// Main runner
async function run() {
  console.log("🚀 Starting TamilMV scrape...");

  const categories = [
    { url: "https://www.1tamilmv.cards/index.php?/forums/forum/11-web-hd-itunes-hd-bluray/", type: "movie" },
    { url: "https://www.1tamilmv.cards/index.php?/forums/forum/19-web-series-tv-shows/", type: "series" },
    { url: "https://www.1tamilmv.cards/index.php?/forums/forum/10-predvd-dvdscr-cam-tc/", type: "movie" },
    { url: "https://www.1tamilmv.cards/index.php?/forums/forum/17-hollywood-movies-in-multi-audios/", type: "movie" }
  ];

  for (const cat of categories) {
    const items = await scrapeCategory(cat.url, cat.type);

    for (const item of items) {
      const { error } = await supabase
        .from("movies")
        .upsert(item, { onConflict: "id" }); // insert or update
      if (error) {
        console.error("Supabase error:", error.message);
      } else {
        console.log(`✅ Updated: ${item.name}`);
      }
    }
  }

  console.log("🎉 Done updating Supabase!");
}

// Run the scraper
run().catch(err => console.error("Scraper failed:", err));

