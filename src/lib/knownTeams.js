// Well-known football clubs with public logo URLs (api-sports CDN).
// Logos that fail to load degrade gracefully to a colored-initial avatar.
export const KNOWN_TEAMS = [
  // Premier League
  { name: "Manchester United", league: "Premier League", color: "#DA291C", logo: "https://media.api-sports.io/football/teams/33.png" },
  { name: "Manchester City", league: "Premier League", color: "#6CABDD", logo: "https://media.api-sports.io/football/teams/50.png" },
  { name: "Liverpool", league: "Premier League", color: "#C8102E", logo: "https://media.api-sports.io/football/teams/40.png" },
  { name: "Chelsea", league: "Premier League", color: "#034694", logo: "https://media.api-sports.io/football/teams/49.png" },
  { name: "Arsenal", league: "Premier League", color: "#EF0107", logo: "https://media.api-sports.io/football/teams/42.png" },
  { name: "Tottenham Hotspur", league: "Premier League", color: "#132257", logo: "https://media.api-sports.io/football/teams/47.png" },
  { name: "Newcastle United", league: "Premier League", color: "#241F20", logo: "https://media.api-sports.io/football/teams/34.png" },
  { name: "Aston Villa", league: "Premier League", color: "#95BFE5", logo: "https://media.api-sports.io/football/teams/63.png" },
  { name: "West Ham United", league: "Premier League", color: "#7A263A", logo: "https://media.api-sports.io/football/teams/48.png" },
  { name: "Everton", league: "Premier League", color: "#003399", logo: "https://media.api-sports.io/football/teams/51.png" },
  // La Liga
  { name: "Real Madrid", league: "La Liga", color: "#FEBE10", logo: "https://media.api-sports.io/football/teams/541.png" },
  { name: "Barcelona", league: "La Liga", color: "#A50044", logo: "https://media.api-sports.io/football/teams/529.png" },
  { name: "Atlético Madrid", league: "La Liga", color: "#CB3524", logo: "https://media.api-sports.io/football/teams/530.png" },
  { name: "Sevilla", league: "La Liga", color: "#D9232D", logo: "https://media.api-sports.io/football/teams/536.png" },
  { name: "Real Sociedad", league: "La Liga", color: "#0067B1", logo: "https://media.api-sports.io/football/teams/548.png" },
  { name: "Villarreal", league: "La Liga", color: "#FFE667", logo: "https://media.api-sports.io/football/teams/533.png" },
  { name: "Real Betis", league: "La Liga", color: "#00954C", logo: "https://media.api-sports.io/football/teams/543.png" },
  { name: "Valencia", league: "La Liga", color: "#EE3524", logo: "https://media.api-sports.io/football/teams/532.png" },
  // Serie A
  { name: "Juventus", league: "Serie A", color: "#000000", logo: "https://media.api-sports.io/football/teams/496.png" },
  { name: "AC Milan", league: "Serie A", color: "#FB090B", logo: "https://media.api-sports.io/football/teams/489.png" },
  { name: "Inter Milan", league: "Serie A", color: "#010E80", logo: "https://media.api-sports.io/football/teams/505.png" },
  { name: "Napoli", league: "Serie A", color: "#12A0D7", logo: "https://media.api-sports.io/football/teams/492.png" },
  { name: "Roma", league: "Serie A", color: "#8E1F2F", logo: "https://media.api-sports.io/football/teams/497.png" },
  { name: "Lazio", league: "Serie A", color: "#87D8F7", logo: "https://media.api-sports.io/football/teams/487.png" },
  { name: "Atalanta", league: "Serie A", color: "#1E71B8", logo: "https://media.api-sports.io/football/teams/499.png" },
  { name: "Fiorentina", league: "Serie A", color: "#592C82", logo: "https://media.api-sports.io/football/teams/502.png" },
  // Bundesliga
  { name: "Bayern Munich", league: "Bundesliga", color: "#DC052D", logo: "https://media.api-sports.io/football/teams/157.png" },
  { name: "Borussia Dortmund", league: "Bundesliga", color: "#FDE100", logo: "https://media.api-sports.io/football/teams/165.png" },
  { name: "RB Leipzig", league: "Bundesliga", color: "#DD0741", logo: "https://media.api-sports.io/football/teams/173.png" },
  { name: "Bayer Leverkusen", league: "Bundesliga", color: "#E32219", logo: "https://media.api-sports.io/football/teams/168.png" },
  { name: "Eintracht Frankfurt", league: "Bundesliga", color: "#E1000F", logo: "https://media.api-sports.io/football/teams/169.png" },
  // Ligue 1
  { name: "Paris Saint-Germain", league: "Ligue 1", color: "#004170", logo: "https://media.api-sports.io/football/teams/85.png" },
  { name: "Marseille", league: "Ligue 1", color: "#2FAEE0", logo: "https://media.api-sports.io/football/teams/81.png" },
  { name: "Lyon", league: "Ligue 1", color: "#1A2B5E", logo: "https://media.api-sports.io/football/teams/80.png" },
  { name: "Monaco", league: "Ligue 1", color: "#E51B22", logo: "https://media.api-sports.io/football/teams/91.png" },
  // Others
  { name: "Ajax", league: "Eredivisie", color: "#D2122E", logo: "https://media.api-sports.io/football/teams/194.png" },
  { name: "Benfica", league: "Liga Portugal", color: "#E30613", logo: "https://media.api-sports.io/football/teams/211.png" },
  { name: "Celtic", league: "Scottish Premiership", color: "#018749", logo: "https://media.api-sports.io/football/teams/247.png" },
  { name: "Rangers", league: "Scottish Premiership", color: "#1B458F", logo: "https://media.api-sports.io/football/teams/257.png" },
  { name: "Galatasaray", league: "Süper Lig", color: "#FBB800", logo: "https://media.api-sports.io/football/teams/561.png" },
  { name: "Fenerbahçe", league: "Süper Lig", color: "#1A2B6B", logo: "https://media.api-sports.io/football/teams/562.png" },
  // Regional (names only — color avatar; upload a logo if desired)
  { name: "Al Hilal", league: "Saudi Pro League", color: "#1B4DA0" },
  { name: "Al Nassr", league: "Saudi Pro League", color: "#FDE100" },
  { name: "Al Ahli", league: "Saudi Pro League", color: "#00A651" },
  { name: "Al Ittihad", league: "Saudi Pro League", color: "#D9A534" },
  { name: "Al Ahly", league: "Egyptian Premier League", color: "#C8102E" },
  { name: "Zamalek", league: "Egyptian Premier League", color: "#FFFFFF" },
];