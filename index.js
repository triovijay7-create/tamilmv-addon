const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const manifest = {
  id: "community.tamilmv.addon",
  version: "0.0.1",
  name: "TamilMV Scraper",
  types: ["movie", "series"],
  catalogs: [
    { type: "movie", id: "movies_cat", name: "Tamil Movies" },
    { type: "series", id: "series_cat", name: "Tamil Web Series" },
    { type: "movie", id: "cam_cat", name: "PreDVD / CAM" },
    { type: "movie", id: "hollywood_cat", name: "Hollywood Multi-Audio" }
  ],
  resources: ["catalog", "meta", "stream"]
};

const builder = new addonBuilder(manifest);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyOWNjYTEwZGExOTkwMzA0OTRmMzFmYjNkOTFkMWEwNiIsIm5iZiI6MTc3Mzk2MjAwOS41MTMsInN1YiI6IjY5YmM4MzE5NDNkMzA3N2FjNDZlNTQxMyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.OEXKB5BU9IDxJuToYoy9s_Tqn3cRtzfLT4JUbsPqaq4";

const posterCache = {}; // Simple memory cache to speed up loading

async function getTmdbPoster(title) {
  if (posterCache[title]) return posterCache[title];
  try {
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}&include_adult=false&language=en-US&page=1`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${TMDB_TOKEN}` }
    });
    if (data.results && data.results.length > 0 && data.results[0].poster_path) {
      const poster = `https://image.tmdb.org/t/p/w500/${data.results[0].poster_path}`;
      posterCache[title] = poster;
      return poster;
    }
  } catch (e) { console.error("TMDB Error:", e.message); }
  return "https://via.placeholder.com/200x300.png?text=No+Poster";
}

function formatMagnetTitle(magnetUrl) {
  try {
    const params = new URLSearchParams(magnetUrl.split('?')[1]);
    const dn = params.get('dn');
    if (!dn) return "Magnet Link";
    let title = decodeURIComponent(dn).replace(/www\.1TamilMV\.cards\s*-\s*/i, '').replace(/\./g, ' ');
    return title.split(' - ').join('\n');
  } catch (e) { return "Magnet Link"; }
}

builder.defineCatalogHandler(async (args) => {
  let urls = [];
  if (args.id === "movies_cat") {
    urls = ["https://www.1tamilmv.cards/index.php?/forums/forum/11-web-hd-itunes-hd-bluray/&sortby=start_date&sortdirection=desc", "https://www.1tamilmv.cards/index.php?/forums/forum/11-web-hd-itunes-hd-bluray/page/2/&sortby=start_date&sortdirection=desc"];
  } else if (args.id === "series_cat") {
    urls = ["https://www.1tamilmv.cards/index.php?/forums/forum/19-web-series-tv-shows/&sortby=start_date&sortdirection=desc", "https://www.1tamilmv.cards/index.php?/forums/forum/19-web-series-tv-shows/page/2/&sortby=start_date&sortdirection=desc"];
  } else if (args.id === "cam_cat") {
    urls = ["https://www.1tamilmv.cards/index.php?/forums/forum/10-predvd-dvdscr-cam-tc/&sortby=start_date&sortdirection=desc", "https://www.1tamilmv.cards/index.php?/forums/forum/10-predvd-dvdscr-cam-tc/page/2/&sortby=start_date&sortdirection=desc"];
  } else if (args.id === "hollywood_cat") {
    urls = ["https://www.1tamilmv.cards/index.php?/forums/forum/17-hollywood-movies-in-multi-audios/&sortby=start_date&sortdirection=desc", "https://www.1tamilmv.cards/index.php?/forums/forum/17-hollywood-movies-in-multi-audios/page/2/&sortby=start_date&sortdirection=desc"];
  }

  let metas = [];
  for (const url of urls) {
    try {
      const { data } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
      const $ = cheerio.load(data);
      for (const el of $(".ipsDataItem").toArray()) {
        const titleRaw = $(el).find(".ipsDataItem_title a").text().trim();
        const link = $(el).find(".ipsDataItem_title a").attr("href");
        if (titleRaw && link) {
          const name = titleRaw.split('(')[0].trim();
          metas.push({ 
            id: Buffer.from(link).toString('base64'), 
            type: args.id === "series_cat" ? "series" : "movie", 
            name: name,
            poster: await getTmdbPoster(name)
          });
        }
      }
    } catch (e) { console.error("Error:", e.message); }
  }
  return { metas };
});

builder.defineMetaHandler(async (args) => {
  return { meta: { id: args.id, type: args.type, name: "TamilMV Content", description: "Streams scraped from TamilMV." } };
});

builder.defineStreamHandler(async (args) => {
  const movieUrl = Buffer.from(args.id, 'base64').toString('utf8');
  try {
    const { data } = await axios.get(movieUrl, { headers: { 'User-Agent': USER_AGENT } });
    const $ = cheerio.load(data);
    const streams = [];
    $('a[href^="magnet:?"]').each((i, el) => {
      streams.push({ title: formatMagnetTitle($(el).attr('href')), url: $(el).attr('href') });
    });
    return { streams };
  } catch (e) { return { streams: [] }; }
});

serveHTTP(builder.getInterface(), { port: 7005 });
