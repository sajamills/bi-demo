// Static content: KPI definitions, data model, roadmap, governance, saved queries, presenter notes.
// All data is synthetic. Fictional franchises; not affiliated with or sourced from any league or club.
const AS_OF="2026-11-16";
const PERIODS={
  "s2026":{label:"2026 season to date (Wks 1–10)",season:2026,wk:10,start:"2026-09-10",end:"2026-11-16",prior:{season:2025,wk:10,start:"2025-09-04",end:"2025-11-10"}},
  "s2025":{label:"2025 full season (Wks 1–18)",season:2025,wk:18,start:"2025-09-04",end:"2026-01-05",prior:null},
};
function shift(d,days){const x=new Date(d+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+days);return x.toISOString().slice(0,10)}
// filters: f = {season, wk, start, end, conf, div}
function teamWhere(f,alias="t",{div=true}={}){const w=[];if(f.team)w.push(`${alias}.team_id = ${f.team}`);if(f.conf)w.push(`${alias}.conference = '${f.conf}'`);if(div&&f.div)w.push(`${alias}.division = '${f.div}'`);return w}
function gameWhere(f,opts){return [`g.season = ${f.season}`,`g.week <= ${f.wk}`,...teamWhere(f,"t",opts)].join("\n  AND ")}
const HOME="JOIN dim_game g ON g.game_id = a.game_id\nJOIN dim_team t ON t.team_id = g.home_team_id";

const KPIS=[
  {id:"att",label:"Attendance (% of capacity)",fmt:"pct",owner:"SVP Club Business",steward:"Ticketing Analytics",refresh:"Game day + 2 h",
   def:"Scanned attendance ÷ stadium capacity across home games played in the period. Attributed to the home team.",
   sql:f=>`SELECT ROUND(100.0 * SUM(a.scanned_attendance) / SUM(a.capacity), 1) AS attendance_pct
FROM fact_game_attendance a
${HOME}
WHERE ${gameWhere(f)};`},
  {id:"tix",label:"Ticket revenue",fmt:"money",owner:"SVP Club Business",steward:"Ticketing Analytics",refresh:"Daily 6:00 AM",
   def:"Primary ticket revenue (tickets distributed × average price) for home games in the period.",
   sql:f=>`SELECT SUM(a.ticket_revenue) AS ticket_revenue
FROM fact_game_attendance a
${HOME}
WHERE ${gameWhere(f)};`},
  {id:"view",label:"Avg viewers per game",fmt:"m",owner:"EVP Media",steward:"Media Analytics",refresh:"Daily (ratings feed)",
   def:"Average audience per game across broadcast, cable and streaming, in millions. Attributed to the home team.",
   sql:f=>`WITH per_game AS (
  SELECT g.game_id, SUM(v.avg_viewers_m) AS viewers_m
  FROM fact_viewership v
  JOIN dim_game g ON g.game_id = v.game_id
  JOIN dim_team t ON t.team_id = g.home_team_id
  WHERE ${gameWhere(f).replace(/\n  /g,"\n    ")}
  GROUP BY g.game_id
)
SELECT ROUND(AVG(viewers_m), 2) AS avg_viewers_m FROM per_game;`},
  {id:"adspend",label:"Ad spend",fmt:"money",owner:"EVP Media",steward:"Ad Sales Analytics",refresh:"Daily (ad server + partner feeds)",
   def:"Advertiser spend delivered against games in the period, across broadcast, cable and streaming. Attributed to the home team.",
   sql:f=>`SELECT SUM(d.ad_spend) AS ad_spend
FROM fact_ad_delivery d
JOIN dim_game g ON g.game_id = d.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE ${gameWhere(f)};`},
  {id:"imps",label:"Ad impressions",fmt:"bn",owner:"EVP Media",steward:"Ad Sales Analytics",refresh:"Daily (ad server + partner feeds)",
   def:"Total ad impressions delivered (average audience × ad units) across all platforms, in billions.",
   sql:f=>`SELECT SUM(d.impressions) AS impressions
FROM fact_ad_delivery d
JOIN dim_game g ON g.game_id = d.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE ${gameWhere(f)};`},
  {id:"cpms",label:"CPM · Streaming",fmt:"money2",owner:"EVP Media",steward:"Ad Sales Analytics",refresh:"Daily",
   def:"Cost per 1,000 impressions on streaming (League+ and partner streams) = ad spend ÷ impressions × 1,000.",
   sql:f=>`SELECT ROUND(1000.0 * SUM(d.ad_spend) / SUM(d.impressions), 2) AS streaming_cpm
FROM fact_ad_delivery d
JOIN dim_game g ON g.game_id = d.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE d.platform = 'Streaming'
  AND ${gameWhere(f)};`},
  {id:"cpmn",label:"CPM · Network (TV)",fmt:"money2",owner:"EVP Media",steward:"Ad Sales Analytics",refresh:"Daily",
   def:"Cost per 1,000 impressions on linear network TV (broadcast + cable) = ad spend ÷ impressions × 1,000.",
   sql:f=>`SELECT ROUND(1000.0 * SUM(d.ad_spend) / SUM(d.impressions), 2) AS network_cpm
FROM fact_ad_delivery d
JOIN dim_game g ON g.game_id = d.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE d.platform IN ('Broadcast', 'Cable')
  AND ${gameWhere(f)};`},
  {id:"subs",noSeason:true,label:"League+ subscribers",fmt:"int",owner:"SVP Direct-to-Consumer",steward:"DTC Analytics",refresh:"Hourly",
   def:"Streaming subscriptions active on the last day of the period (started on or before, not yet ended). Attributed to the fan's home team.",
   sql:f=>`SELECT COUNT(*) AS active_subscribers
FROM fact_subscriptions s
JOIN dim_fan  fn ON fn.fan_id = s.fan_id
JOIN dim_team t  ON t.team_id = fn.home_team_id
WHERE s.start_date <= '${f.end}'
  AND (s.end_date IS NULL OR s.end_date > '${f.end}')${teamWhere(f).map(w=>"\n  AND "+w).join("")};`},
  {id:"merch",label:"Merch spend per buying fan",fmt:"money",owner:"SVP Consumer Products",steward:"E-commerce Analytics",refresh:"Daily 6:00 AM",
   def:"Net merchandise revenue ÷ distinct fans who bought in the period (online, stadium and retail partner). Measured on the fan panel.",
   sql:f=>`SELECT ROUND(SUM(m.revenue) / COUNT(DISTINCT m.fan_id), 2) AS spend_per_buying_fan
FROM fact_merch_orders m
JOIN dim_team t ON t.team_id = m.team_id
WHERE m.order_date BETWEEN '${f.start}' AND '${f.end}'${teamWhere(f).map(w=>"\n  AND "+w).join("")};`},
  {id:"inj",label:"Injuries per 1,000 plays",fmt:"dec",inverse:true,restricted:true,owner:"Chief Medical Officer",steward:"Health & Safety Analytics",refresh:"Weekly (Tue)",
   def:"Reported injuries ÷ plays, × 1,000, for games in the period. Restricted health data: only aggregated rates are shown outside Health & Safety. Lower is better.",
   sql:f=>`WITH team_games AS (
  SELECT g.game_id, t.team_id, g.total_plays / 2.0 AS plays
  FROM dim_game g
  JOIN dim_team t ON t.team_id IN (g.home_team_id, g.away_team_id)
  WHERE ${gameWhere(f).replace(/\n  /g,"\n    ")}
)
SELECT ROUND(1000.0 * (SELECT COUNT(*) FROM fact_injuries i
                       JOIN team_games tg ON tg.game_id = i.game_id AND tg.team_id = i.team_id)
       / SUM(plays), 2) AS injuries_per_1000_plays
FROM team_games;`},
];

const ERD={
  tables:{
    fact_viewership:{x:30,y:20,desc:"Grain: one row per game per platform. Source: ratings and streaming partner feeds (daily).",owner:"Media",cols:[["view_id","int","PK"],["game_id","int","FK"],["platform","text"],["avg_viewers_m","real"],["minutes_viewed_m","real"]]},
    dim_date:{x:445,y:20,desc:"Calendar dimension. One row per day.",owner:"Data Engineering",cols:[["date_key","int","PK"],["date","text"],["year","int"],["quarter","text"],["month","int"],["month_name","text"],["day_of_week","text"]]},
    fact_merch_orders:{x:860,y:20,desc:"Grain: one row per merchandise order line. Source: e-commerce + stadium POS (nightly).",owner:"Consumer Products",cols:[["order_id","int","PK"],["order_date","text"],["date_key","int","FK"],["fan_id","int","FK"],["team_id","int","FK"],["category","text"],["channel","text"],["quantity","int"],["revenue","real"],["cost","real"]]},
    fact_game_attendance:{x:30,y:250,desc:"Grain: one row per game. Source: ticketing platform + gate scans.",owner:"Club Business",cols:[["game_id","int","PK"],["capacity","int"],["tickets_distributed","int"],["scanned_attendance","int"],["avg_ticket_price","real"],["secondary_avg_price","real"],["ticket_revenue","real"]]},
    dim_game:{x:445,y:230,desc:"Grain: one row per game – season, week, kickoff window, surface, plays.",owner:"Football Operations",cols:[["game_id","int","PK"],["season","int"],["week","int"],["date_key","int","FK"],["game_date","text"],["home_team_id","int","FK"],["away_team_id","int","FK"],["kickoff_et","text"],["game_window","text"],["network","text"],["surface","text"],["total_plays","int"],["home_score","int"],["away_score","int"]]},
    dim_fan:{x:860,y:290,desc:"Fan 360 identity: one row per fan across ticketing, streaming, merch and app. Contains PII (contact_email).",owner:"Marketing / Fan Data",cols:[["fan_id","int","PK"],["home_team_id","int","FK"],["segment","text"],["age_band","text"],["state","text"],["contact_email","text","PII"],["signup_date","text"],["marketing_opt_in","int"]]},
    fact_injuries:{x:30,y:500,desc:"Grain: one row per reported injury. RESTRICTED health data – aggregated access only outside Health & Safety.",owner:"Health & Safety",cols:[["injury_id","int","PK"],["game_id","int","FK"],["team_id","int","FK"],["body_part","text","RST"],["severity","text","RST"],["games_missed","int"]]},
    dim_team:{x:445,y:580,desc:"Clubs, conference, division, stadium – drives club-level row-level security.",owner:"Club Business",cols:[["team_id","int","PK"],["team","text"],["city","text"],["conference","text"],["division","text"],["stadium_capacity","int"],["market_size","text"],["surface","text"]]},
    fact_odds:{x:30,y:730,desc:"Grain: one row per game. Consensus betting lines from a licensed odds provider (live, every few seconds). Contract-restricted third-party data.",owner:"Media / Betting Partnerships",cols:[["game_id","int","PK"],["open_spread","real"],["current_spread","real"],["open_total","real"],["current_total","real"],["home_moneyline","int"],["away_moneyline","int"],["home_handle_pct","int"],["updated_at","text"]]},
    fact_ad_delivery:{x:860,y:730,desc:"Grain: one row per game per platform. Ad units, impressions and advertiser spend from the ad server and network partners.",owner:"Media / Ad Sales",cols:[["ad_id","int","PK"],["game_id","int","FK"],["platform","text"],["ad_units","int"],["impressions","int"],["ad_spend","real"]]},
    fact_subscriptions:{x:860,y:520,desc:"Grain: one row per League+ streaming subscription (start / end).",owner:"Direct-to-Consumer",cols:[["sub_id","int","PK"],["fan_id","int","FK"],["plan","text"],["start_date","text"],["end_date","text"],["monthly_price","real"]]},
  },
  rels:[["fact_viewership","game_id","dim_game","game_id"],["fact_game_attendance","game_id","dim_game","game_id"],["fact_injuries","game_id","dim_game","game_id"],
    ["fact_injuries","team_id","dim_team","team_id"],["dim_game","home_team_id","dim_team","team_id"],["dim_game","away_team_id","dim_team","team_id"],["dim_game","date_key","dim_date","date_key"],
    ["fact_merch_orders","fan_id","dim_fan","fan_id"],["fact_merch_orders","date_key","dim_date","date_key"],["fact_merch_orders","team_id","dim_team","team_id"],
    ["dim_fan","home_team_id","dim_team","team_id"],["fact_subscriptions","fan_id","dim_fan","fan_id"],
    ["fact_odds","game_id","dim_game","game_id"],["fact_ad_delivery","game_id","dim_game","game_id"]],
  height:960
};

const ARCH={cols:[
  {t:"Sources",n:[["s1","Ticketing platform","sales, gate scans","src"],["s2","League+ streaming app","subs, minutes","src"],["s3","Broadcast partners","ratings feeds","src"],["s4","E-commerce & POS","merch orders","src"],["s7","Ad server","impressions, spend","src"],["s6","Licensed odds feed","official league data","src"],["s5","Player tracking","plays, health","src"]]},
  {t:"Ingest",n:[["i1","AppFlow · DMS","SaaS + database CDC","appflow"],["i2","Kinesis + Firehose","game-day streams","kinesis"],["i3","AWS Glue jobs","batch files & APIs","glue"]]},
  {t:"Lake",n:[["l1","Amazon S3","Bronze & Silver · Parquet","s3"],["l2","Glue Data Catalog","tables + schemas","catalog"]]},
  {t:"Transform",n:[["t1","dbt on Redshift","models + tests","dbt"],["t2","Amazon MWAA","Airflow orchestration","mwaa"]]},
  {t:"Warehouse",n:[["w1","Redshift Serverless","Gold star schemas","redshift"],["w2","Athena","ad-hoc SQL on S3","athena"]]},
  {t:"Consume",n:[["c1","Semantic layer","certified KPIs","semantic"],["c2","Tableau / QuickSight","league + 32 clubs","bi"],["c3","Data sharing · Clean Rooms","media & sponsors","cleanrooms"],["c4","SageMaker · Bedrock","churn model · GenAI","ml"]]},
 ],edges:[["s1","i1"],["s2","i1"],["s3","i3"],["s4","i1"],["s7","i3"],["s6","i2"],["s5","i2"],["i1","l1"],["i2","l1"],["i3","l1"],["i3","l2"],["l1","t1"],["l2","w2"],["t2","w1"],["t1","w1"],["w1","c1"],["w1","c2"],["w1","c3"],["w1","c4"],["w2","c4"]],
 band:"Governance across every layer: Lake Formation (table/column/row access) · DataZone (catalog & data products) · IAM + Secrets Manager · CloudTrail & CloudWatch · Cost Explorer & budgets",
 bandLinks:[["Lake Formation","lakeformation"],["DataZone","datazone"],["IAM + Secrets Manager","iam"],["CloudTrail & CloudWatch","cloudwatch"],["Cost Explorer & budgets","cost"]]};
const AWS_INFO={
  src:{t:"Source systems",role:"Operational systems that produce the data: ticketing, the League+ app, broadcast partners, e-commerce, the ad server, the licensed odds feed and player tracking.",why:"Each source gets a named owner and a data contract (fields, freshness, format) so a source change doesn't silently break dashboards.",cost:"No platform cost – the work is contracts, access and monitoring."},
  appflow:{t:"Amazon AppFlow · AWS DMS",role:"AppFlow pulls from SaaS apps (CRM, marketing tools). DMS streams change data capture (CDC) from operational databases like ticketing and e-commerce.",why:"Managed connectors instead of hand-built scripts; CDC moves only the rows that changed.",cost:"Pay per flow run / replication instance – far cheaper than nightly full extracts."},
  kinesis:{t:"Kinesis Data Streams + Data Firehose",role:"Real-time ingestion for game-day feeds: gate scans, the live odds feed, player tracking.",why:"Streaming only where minutes matter. Firehose lands data straight into S3 (or Redshift) with no servers to run.",cost:"Pay per shard-hour / GB; scale up for game days, down mid-week."},
  glue:{t:"AWS Glue (jobs)",role:"Serverless Spark jobs for batch files and APIs – ratings files, ad-server exports.",why:"No clusters to manage; good for standard ETL. EMR is the alternative for heavy custom Spark.",cost:"Pay per DPU-minute while jobs run."},
  s3:{t:"Amazon S3 – the data lake",role:"Bronze (raw, immutable) and Silver (cleaned) layers, stored as columnar Parquet partitioned by season/week.",why:"Cheap, durable, and lets us replay any history if a rule changes.",cost:"Pennies per GB; lifecycle rules move old raw data to cheaper storage tiers."},
  catalog:{t:"AWS Glue Data Catalog",role:"One catalog of table definitions and schemas for everything in the lake.",why:"Athena, Redshift Spectrum, EMR and Lake Formation all read the same catalog – define once.",cost:"Effectively free at this scale."},
  dbt:{t:"dbt on Redshift",role:"Transforms Silver into Gold star schemas; tests (unique, not null, relationships, custom) run on every build; lineage docs generated automatically.",why:"Transformations as version-controlled SQL with code review and CI – same discipline as application code.",cost:"Runs on warehouse compute; incremental models keep it small."},
  mwaa:{t:"Amazon MWAA (managed Airflow)",role:"Orchestrates the DAG: ingest → staging → marts → quality checks → semantic refresh → BI extracts.",why:"Dependencies, retries and alerting in one place; failed tests stop downstream publishing.",cost:"Small fixed environment cost; scales workers for game-day loads."},
  redshift:{t:"Amazon Redshift Serverless",role:"The Gold layer – governed star schemas behind every certified dashboard. Spectrum queries S3 directly when needed.",why:"Fast, concurrent BI queries; Serverless absorbs spiky game-day demand without sizing clusters. Snowflake or Databricks would also fit – the design is the same.",cost:"Pay for compute used (RPU-hours); partitioning, clustering and aggregate tables cut it ~28% in this demo."},
  athena:{t:"Amazon Athena",role:"Ad-hoc SQL directly on S3 for exploration and data science.",why:"No infrastructure; ideal for occasional queries on raw or historical data.",cost:"Pay per TB scanned – Parquet + partitions keep scans small."},
  semantic:{t:"Semantic layer",role:"One certified definition per KPI (attendance %, CPM, League+ subscribers) consumed by every tool.",why:"Ends 'my number vs. your number' between the league office and clubs.",cost:"Mostly people and process; caching reduces warehouse load."},
  bi:{t:"Tableau / Amazon QuickSight",role:"Dashboards for league executives and the 32 clubs. Tableau for analyst-heavy teams; QuickSight for embedded club portals with row-level security.",why:"Tool follows the user – both read the same certified metrics.",cost:"Tableau per user; QuickSight per session/reader – efficient for 32 club portals."},
  cleanrooms:{t:"Redshift data sharing · AWS Clean Rooms",role:"Share live, governed data with media partners and sponsors; Clean Rooms lets partners match audiences without seeing fan PII.",why:"No more emailed extracts; privacy by design for sponsor ROI analysis.",cost:"Pay per query/collaboration; removes manual extract work."},
  ml:{t:"Amazon SageMaker · Amazon Bedrock",role:"SageMaker trains and scores models like League+ churn; scores land in a certified Gold table. Bedrock powers natural-language Q&A over the semantic layer.",why:"Models and GenAI read governed data and respect Lake Formation permissions – see the Ask the data and Churn pages.",cost:"Pay per training/inference hour and per token; batch scoring nightly keeps it low."},
  lakeformation:{t:"AWS Lake Formation",role:"Table, column and row-level permissions across the lake and catalog – PII masking, club-level row security, restricted health data.",why:"One place to manage access instead of per-tool rules.",cost:"No extra charge beyond the underlying services."},
  datazone:{t:"Amazon DataZone",role:"Business catalog: data products, owners, glossary terms and access requests with approval workflow.",why:"How business users find certified data and request access – governance with a front door.",cost:"Per-user pricing for the portal."},
  iam:{t:"IAM + Secrets Manager",role:"Least-privilege roles per team and pipeline; credentials and API keys stored and rotated in Secrets Manager.",why:"No shared keys, auditable access.",cost:"IAM free; Secrets Manager pennies per secret."},
  cloudwatch:{t:"CloudTrail & CloudWatch",role:"CloudTrail audits who accessed or changed what; CloudWatch monitors pipeline runs, freshness SLAs and alerts owners.",why:"Feeds the Monday brief's incident list and the data-quality scorecard.",cost:"Low – pay per log volume and alarm."},
  cost:{t:"Cost Explorer & budgets",role:"Tag every resource by team and product; budgets alert before overruns; track cost per dashboard and per query.",why:"FinOps is part of the manager's job: freshness vs. performance vs. cost trade-offs.",cost:"Free – and it pays for itself."},
};

const LINEAGE={cols:[
  {t:"Source",n:[["a","Gate scan events","real-time"],["b","Ticketing sales","hourly"]]},
  {t:"Bronze",n:[["c","raw.gate_scans",""],["d","raw.ticket_orders",""]]},
  {t:"Silver",n:[["e","stg_scans","dedupe re-entries"],["f","stg_ticket_orders","void / refund logic"]]},
  {t:"Gold",n:[["g","fact_game_attendance",""],["h","dim_game",""]]},
  {t:"Metric",n:[["i","Attendance % capacity","certified"]]},
  {t:"Dashboards",n:[["j","League Executive Scorecard",""],["k","Game-Day Ops",""]]},
 ],edges:[["a","c"],["b","d"],["c","e"],["d","f"],["e","g"],["f","g"],["g","i"],["h","i"],["i","j"],["i","k"]],
 band:"Impact analysis: a change to raw.gate_scans touches 1 Gold table, 1 certified metric and 2 dashboards → governance review + release outside the game-day freeze window."};

const ROADMAP=[
  {h:"Now",q:"Q4 2026 · in season",t:"League Executive Scorecard v2",d:"Certify 8 KPIs across ticketing, media, streaming and merch on the semantic layer; retire competing club spreadsheets.",team:"BI",status:"In progress",pct:70,R:60,I:3,C:.9,E:3,metric:"One version of truth for league KPIs; Monday exec pack prep 2 days → 2 hours",stake:6},
  {h:"Now",q:"Q4 2026 · in season",t:"Club data sharing with row-level security",d:"Each of the 32 clubs sees its own data plus league benchmarks – no more emailed extracts.",team:"Governance + BI",status:"At risk",pct:35,R:120,I:2,C:.7,E:4,metric:"32 clubs self-serving; ad-hoc extract requests −40%",stake:5,risk:"Depends on club SSO onboarding (12 of 32 done)"},
  {h:"Now",q:"Q4 2026 · in season",t:"Real-time game-day ops dashboard",d:"Gate scan rates, entry throughput and attendance by gate, refreshed every 5 minutes on game day.",team:"Data Eng",status:"On track",pct:60,R:40,I:2,C:.8,E:3,metric:"Stadium ops sees no-shows by kickoff; staffing adjusted in-game",stake:3},
  {h:"Now",q:"Q4 2026 · in season",t:"Live odds & betting-insights feed",d:"Ingest licensed consensus lines in real time; schedule & odds board for media and partnerships, with responsible-gaming controls.",team:"Data Eng + Governance",status:"In progress",pct:50,R:80,I:2,C:.7,E:3,metric:"Odds freshness < 60 s on game days; line movement used in broadcast & digital content",stake:4},
  {h:"Next",q:"Q1 2027 · off-season",t:"Fan 360 data product",d:"One fan identity across ticketing, League+ streaming, merch and the app – the base for personalization.",team:"Data Eng + BI",status:"Planned",pct:0,R:200,I:3,C:.7,E:8,metric:"70% of fans matched to one ID; campaign ROI measured by segment",stake:8},
  {h:"Next",q:"Q1 2027 · off-season",t:"Self-service semantic layer",d:"Governed metric store so club and league business users build their own views.",team:"BI",status:"Planned",pct:0,R:150,I:3,C:.7,E:6,metric:"Self-service share of queries 59% → 70%",stake:6},
  {h:"Next",q:"Q2 2027",t:"Data catalog & lineage rollout",d:"Every Gold asset cataloged with owner, steward, classification and lineage.",team:"Governance",status:"Discovery",pct:0,R:100,I:2,C:.8,E:4,metric:"100% of Gold tables with owner + lineage",stake:5},
  {h:"Later",q:"H2 2027",t:"League+ churn prediction",d:"Score subscribers at risk of off-season churn; feed retention offers before the draft.",team:"Analytics",status:"Idea",pct:0,R:120,I:3,C:.5,E:6,metric:"Off-season subscriber churn −3 pts",stake:4},
  {h:"Later",q:"H2 2027",t:"Sponsorship ROI attribution",d:"Tie sponsor impressions (broadcast, stadium, digital) to fan actions.",team:"Analytics + BI",status:"Idea",pct:0,R:80,I:2,C:.5,E:7,metric:"ROI reports for top 20 sponsors at renewal",stake:4},
  {h:"Later",q:"H2 2027",t:"Health & safety analytics hub",d:"Restricted, governed injury trends by surface, play type and rule change for the competition committee.",team:"Analytics + Governance",status:"Idea",pct:0,R:30,I:3,C:.6,E:5,metric:"Committee decisions backed by certified injury data",stake:3},
];
const DEPS=[
  ["Club data sharing with row-level security","Club SSO onboarding (IT + clubs)","Governance","High","Weekly club onboarding tracker; pilot with 12 onboarded clubs first"],
  ["Real-time game-day ops dashboard","Kinesis capacity on game days","Data Eng","Medium","Load test before Week 12; fall back to 15-min batch"],
  ["Fan 360 data product","Identity resolution vendor; consent / privacy review","Data Eng","Medium","Start with ticketing + streaming match; privacy sign-off in January"],
  ["League Executive Scorecard v2","Finance sign-off on ticket-revenue definition","BI","Low","Definition workshop booked; decision owner: SVP Club Business"],
  ["Live odds & betting-insights feed","Odds-provider contract terms (display & redistribution rights)","Governance + Legal","Medium","Contract review before any external display; internal analytics only until signed"],
  ["All releases","Game-day change freeze (Thu–Mon) and postseason freeze","Delivery","Medium","Ship Tue/Wed; big migrations scheduled for the off-season"],
];

const CATALOG=[
  ["fact_game_attendance","Gold","Club Business","Ticketing Analytics","Confidential","Game day + 2 h",true],
  ["fact_viewership","Gold","Media","Media Analytics","Confidential","Daily",true],
  ["fact_merch_orders","Gold","Consumer Products","E-com Analytics","Internal","Daily 6 AM",true],
  ["fact_subscriptions","Gold","Direct-to-Consumer","DTC Analytics","Confidential","Hourly",true],
  ["dim_fan","Gold","Marketing / Fan Data","Fan Data Steward","PII","Daily 6 AM",true],
  ["fact_injuries","Gold","Health & Safety","H&S Analytics","Restricted","Weekly",true],
  ["fact_odds","Gold","Betting Partnerships","Odds Data Steward","Restricted","Live (< 60 s)",true],
  ["fact_ad_delivery","Gold","Media / Ad Sales","Ad Sales Analytics","Confidential","Daily",true],
  ["dim_game","Gold","Football Operations","Football Ops Data","Internal","On change",true],
  ["dim_team","Gold","Club Business","Club Data Steward","Public","On change",true],
  ["bi_dashboard_usage","Silver","BI Platform","BI Admin","Internal","Weekly",false],
];
const ACCESS={roles:["League executive","Club staff","Media & partnerships","Analyst","Health & Safety"],
  sets:["fact_game_attendance","fact_viewership","dim_fan","fact_injuries"],
  grid:[["Full","Full","Masked PII","Aggregated only"],["RLS: own club + benchmarks","Full","RLS: own club fans","None"],["Aggregated only","Full","Masked PII","None"],["Full","Full","Masked PII","Aggregated only"],["Read","None","None","Full (restricted)"]]};

const DQ=[
  ["Scanned attendance ≤ 105% of capacity","fact_game_attendance","Validity","SELECT COUNT(*) FROM fact_game_attendance WHERE scanned_attendance > capacity * 1.05","High"],
  ["Every completed game has viewership","fact_viewership","Completeness",`SELECT COUNT(*) FROM dim_game g LEFT JOIN fact_viewership v ON v.game_id = g.game_id WHERE v.game_id IS NULL AND g.game_date <= '${AS_OF}'`,"High"],
  ["Merch order has a fan","fact_merch_orders","Completeness","SELECT COUNT(*) FROM fact_merch_orders WHERE fan_id IS NULL","Medium"],
  ["Injured player's team played in the game","fact_injuries","Consistency","SELECT COUNT(*) FROM fact_injuries i JOIN dim_game g ON g.game_id = i.game_id WHERE i.team_id NOT IN (g.home_team_id, g.away_team_id)","High"],
  ["Ticket price is positive","fact_game_attendance","Validity","SELECT COUNT(*) FROM fact_game_attendance WHERE avg_ticket_price <= 0","High"],
  ["Live odds updated in the last 60 seconds","fact_odds","Freshness",`SELECT COUNT(*) FROM fact_odds o JOIN dim_game g ON g.game_id = o.game_id WHERE g.game_date > '${AS_OF}' AND o.updated_at < datetime('now', '-60 seconds')`,"High"],
  ["Favorite has the negative moneyline","fact_odds","Consistency","SELECT COUNT(*) FROM fact_odds WHERE (current_spread < 0 AND home_moneyline > 0) OR (current_spread > 0 AND away_moneyline > 0)","Medium"],
  ["Completed games have a final score","dim_game","Completeness",`SELECT COUNT(*) FROM dim_game WHERE game_date < '${AS_OF}' AND home_score IS NULL`,"High"],
  ["Fan contact email is unique","dim_fan","Uniqueness","SELECT COUNT(*) FROM (SELECT contact_email FROM dim_fan GROUP BY contact_email HAVING COUNT(*) > 1)","Medium"],
  ["Subscription ends after it starts","fact_subscriptions","Validity","SELECT COUNT(*) FROM fact_subscriptions WHERE end_date IS NOT NULL AND end_date < start_date","Medium"],
  ["Ratings reconcile with ad-server delivery","fact_viewership","Consistency","SELECT COUNT(*) FROM fact_viewership v JOIN fact_ad_delivery d ON d.game_id = v.game_id AND d.platform = v.platform WHERE d.impressions / (v.avg_viewers_m * 1e6) > 60","High"],
  ["Merch order team exists","fact_merch_orders","Referential integrity","SELECT COUNT(*) FROM fact_merch_orders m LEFT JOIN dim_team t ON t.team_id = m.team_id WHERE t.team_id IS NULL","Low"],
];

const SAVED=[
  ["Weekly viewership with week-over-week change (window function)",`WITH wk AS (
  SELECT g.season, g.week,
         ROUND(SUM(v.avg_viewers_m) / COUNT(DISTINCT g.game_id), 2) AS avg_viewers_m
  FROM fact_viewership v
  JOIN dim_game g ON g.game_id = v.game_id
  GROUP BY g.season, g.week
)
SELECT season, week, avg_viewers_m,
       ROUND(100.0 * (avg_viewers_m - LAG(avg_viewers_m) OVER (PARTITION BY season ORDER BY week))
             / LAG(avg_viewers_m) OVER (PARTITION BY season ORDER BY week), 1) AS wow_change_pct
FROM wk
ORDER BY season, week;`],
  ["Streaming share by kickoff window – 2025 vs 2026",`SELECT g.game_window,
       ROUND(100.0 * SUM(CASE WHEN g.season = 2025 AND v.platform = 'Streaming' THEN v.avg_viewers_m END)
             / SUM(CASE WHEN g.season = 2025 THEN v.avg_viewers_m END), 1) AS streaming_share_2025,
       ROUND(100.0 * SUM(CASE WHEN g.season = 2026 AND v.platform = 'Streaming' THEN v.avg_viewers_m END)
             / SUM(CASE WHEN g.season = 2026 THEN v.avg_viewers_m END), 1) AS streaming_share_2026
FROM fact_viewership v
JOIN dim_game g ON g.game_id = v.game_id
WHERE g.week <= 10
GROUP BY g.game_window
ORDER BY streaming_share_2026 DESC;`],
  ["Club attendance leaderboard with rank within division",`SELECT t.team, t.division,
       ROUND(100.0 * SUM(a.scanned_attendance) / SUM(a.capacity), 1) AS attendance_pct,
       ROUND(SUM(a.ticket_revenue) / 1e6, 2) AS ticket_revenue_m,
       RANK() OVER (PARTITION BY t.division
                    ORDER BY SUM(a.scanned_attendance) * 1.0 / SUM(a.capacity) DESC) AS rank_in_division
FROM fact_game_attendance a
JOIN dim_game g ON g.game_id = a.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE g.season = 2026
GROUP BY t.team, t.division
ORDER BY t.division, rank_in_division;`],
  ["Secondary-market premium: primetime vs Sunday",`SELECT g.game_window, g.is_primetime,
       COUNT(*) AS games,
       ROUND(AVG(a.avg_ticket_price), 2)    AS avg_primary_price,
       ROUND(AVG(a.secondary_avg_price), 2) AS avg_secondary_price,
       ROUND(100.0 * (AVG(a.secondary_avg_price) - AVG(a.avg_ticket_price))
             / AVG(a.avg_ticket_price), 1) AS secondary_premium_pct
FROM fact_game_attendance a
JOIN dim_game g ON g.game_id = a.game_id
WHERE g.season = 2026
GROUP BY g.game_window, g.is_primetime
ORDER BY secondary_premium_pct DESC;`],
  ["Ad spend vs impressions – streaming vs network",`SELECT CASE WHEN d.platform = 'Streaming' THEN 'Streaming' ELSE 'Network (TV)' END AS channel,
       g.season,
       ROUND(SUM(d.impressions) / 1e9, 2)                        AS impressions_b,
       ROUND(100.0 * SUM(d.impressions) / SUM(SUM(d.impressions)) OVER (PARTITION BY g.season), 1) AS pct_of_impressions,
       ROUND(SUM(d.ad_spend) / 1e6, 1)                           AS ad_spend_m,
       ROUND(100.0 * SUM(d.ad_spend) / SUM(SUM(d.ad_spend)) OVER (PARTITION BY g.season), 1)       AS pct_of_spend,
       ROUND(1000.0 * SUM(d.ad_spend) / SUM(d.impressions), 2)  AS cpm
FROM fact_ad_delivery d
JOIN dim_game g ON g.game_id = d.game_id
WHERE g.week <= 10
GROUP BY channel, g.season
ORDER BY g.season, channel;`],
  ["Favorites against the spread by line size",`SELECT CASE WHEN ABS(o.current_spread) <= 3 THEN '0–3'
            WHEN ABS(o.current_spread) <= 7 THEN '3.5–7' ELSE '7.5+' END AS spread_bucket,
       COUNT(*) AS games,
       ROUND(100.0 * SUM(CASE WHEN (o.current_spread < 0 AND g.home_score + o.current_spread > g.away_score)
                              OR (o.current_spread > 0 AND g.away_score - o.current_spread > g.home_score)
                         THEN 1 ELSE 0 END) / COUNT(*), 1) AS favorite_cover_pct,
       ROUND(100.0 * SUM(CASE WHEN g.home_score + g.away_score > o.current_total THEN 1 ELSE 0 END) / COUNT(*), 1) AS over_pct
FROM fact_odds o
JOIN dim_game g ON g.game_id = o.game_id
WHERE g.home_score IS NOT NULL AND o.current_spread <> 0
GROUP BY spread_bucket
ORDER BY spread_bucket;`],
  ["Fan 360 – merch spend and streaming status by segment",`WITH merch AS (
  SELECT fan_id, SUM(revenue) AS merch_spend FROM fact_merch_orders
  WHERE order_date >= '2026-01-01' GROUP BY fan_id
), subs AS (
  SELECT DISTINCT fan_id FROM fact_subscriptions
  WHERE end_date IS NULL OR end_date > '${AS_OF}'
)
SELECT f.segment,
       COUNT(*) AS fans,
       ROUND(100.0 * COUNT(s.fan_id) / COUNT(*), 1) AS pct_active_streaming,
       ROUND(AVG(COALESCE(m.merch_spend, 0)), 2)  AS avg_merch_spend_2026
FROM dim_fan f
LEFT JOIN merch m ON m.fan_id = f.fan_id
LEFT JOIN subs  s ON s.fan_id = f.fan_id
GROUP BY f.segment
ORDER BY avg_merch_spend_2026 DESC;`],
  ["League+ subscriber retention by start cohort",`SELECT substr(start_date, 1, 4) || '-H' || CASE WHEN CAST(substr(start_date, 6, 2) AS INT) <= 6 THEN 1 ELSE 2 END AS start_cohort,
       COUNT(*) AS subscribers,
       SUM(CASE WHEN end_date IS NULL THEN 1 ELSE 0 END) AS still_active,
       ROUND(100.0 * SUM(CASE WHEN end_date IS NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS retention_pct
FROM fact_subscriptions
GROUP BY start_cohort
ORDER BY start_cohort;`],
  ["Injury rate by playing surface (restricted – aggregated)",`WITH plays AS (
  SELECT season, surface, COUNT(*) AS games, SUM(total_plays) AS plays
  FROM dim_game GROUP BY season, surface
), inj AS (
  SELECT g.season, g.surface, COUNT(*) AS injuries
  FROM fact_injuries i JOIN dim_game g ON g.game_id = i.game_id
  GROUP BY g.season, g.surface
)
SELECT p.season, p.surface, p.games, i.injuries,
       ROUND(1000.0 * i.injuries / p.plays, 2) AS injuries_per_1000_plays
FROM plays p JOIN inj i ON i.season = p.season AND i.surface = p.surface
ORDER BY p.season, p.surface;`],
  ["Data quality – attendance over capacity and orphan orders",`SELECT 'Attendance over capacity' AS issue, CAST(a.game_id AS TEXT) AS record,
       a.scanned_attendance || ' scanned vs ' || a.capacity || ' capacity' AS detail
FROM fact_game_attendance a
WHERE a.scanned_attendance > a.capacity * 1.05
UNION ALL
SELECT 'Merch order with no fan', CAST(order_id AS TEXT), order_date || ' · $' || revenue
FROM fact_merch_orders WHERE fan_id IS NULL
UNION ALL
SELECT 'Game missing viewership', CAST(g.game_id AS TEXT), g.game_date || ' · week ' || g.week
FROM dim_game g LEFT JOIN fact_viewership v ON v.game_id = g.game_id
WHERE v.game_id IS NULL;`],
  ["Dashboard adoption trend",`SELECT dashboard, certified,
       SUM(CASE WHEN week_start <  '2026-07-01' THEN active_users END) / 26 AS avg_users_h1,
       SUM(CASE WHEN week_start >= '2026-07-01' THEN active_users END) / 19 AS avg_users_h2
FROM bi_dashboard_usage
GROUP BY dashboard, certified
ORDER BY avg_users_h2 DESC;`],
];

const NOTES={
  overview:["Frame: I own the roadmap and I'm the bridge between product owners, BI, Data Engineering, Governance and App Dev – here applied to a league with 32 club stakeholders.","Walk the architecture: ticketing, streaming, broadcast, e-commerce and player tracking feeds → governed warehouse → one set of certified metrics for the league and every club.","Release rhythm follows the football calendar: change freeze on game days (Thu–Mon) and through the postseason; big migrations in the off-season.","Call out the at-risk item proactively: club data sharing depends on SSO onboarding – that's how I'd surface a blocker to leadership."],
  kpi:["Ten certified KPIs across the business, including ad spend, impressions and CPM for streaming vs network TV – streaming carries a higher CPM because it is addressable.","Six of them cover: attendance, ticketing, media, League+ streaming, merch and player health & safety.","Tap ⓘ: owner, steward, refresh and the exact SQL. The definition IS the code – that's how you end 'my number vs. your number' debates between clubs and the league office.","Filter by conference or tap a division bar – self-service for club business teams.","Injury rate is restricted health data: shown only as an aggregated rate and inverse-colored (lower is better)."],
  erd:["Star schema with dim_game at the center: attendance, viewership and injuries all hang off the game; merch and streaming hang off the fan.","dim_team drives club-level row-level security; dim_fan holds PII; fact_injuries columns are marked restricted.","Switch to KPI lineage: gate scans → staging → fact → certified Attendance % → two dashboards. That's impact analysis before a release.","Modeling trade-offs: fan identity is the hard part – the Fan 360 roadmap item exists because ticketing, streaming and merch IDs don't match today."],
  sql:["Self-service on governed data: analysts at the league and clubs query the same certified tables the dashboards use.","Run 'Streaming share by kickoff window' – the media story in one query: streaming share up across windows year over year.","Run the club leaderboard – window functions ranking within division.","'Chart it' turns any result into a visual for a business user."],
  roadmap:["Prioritized with RICE – reach × impact × confidence ÷ effort – balanced against stakeholder need, dependencies and capacity.","Every item has a business success metric, not just 'shipped'.","Sequencing follows the football calendar: in-season items are low-risk and visible; Fan 360 and platform changes land in the off-season.","Dependencies & risks: SSO onboarding for club data sharing – the mitigation is to pilot with the 12 clubs already onboarded."],
  gov:["Run the checks live: attendance over capacity, a game with no viewership feed, orphan merch orders, an injury tagged to the wrong team, duplicate fan emails.","Catalog: every Gold asset has an owner, steward, classification and SLA – PII and restricted health data are labeled.","Access matrix: clubs see their own data plus league benchmarks; health data is aggregated-only outside Health & Safety.","The governance checklist gates every new data product before it earns the certified badge."],
  odds:["Schedule & odds: this week's games with consensus spread, total and moneyline – the feed updates live every few seconds (simulated here; in production a licensed odds provider through the streaming pipeline).","Line movement from open to now, and where the betting handle sits – useful for broadcast and digital content teams.","Governance: odds are licensed third-party data – contract-restricted, freshness SLA under 60 seconds. Pause the feed to show the staleness alert and the failing quality check.","Ties to EXL's real-money gaming practice: responsible gaming and data controls are part of the design, not an afterthought."],
  adopt:["Adoption is the success measure: weekly active users up sharply, with a jump at the start of the season.","Self-service share of queries from ~24% to ~59% after the semantic-layer pilot – fewer ad-hoc requests to the BI team.","Usage drives retirement: the legacy SSRS ticketing report and Concessions Aging are near zero – sunset candidates.","I'd report this monthly to leadership with roadmap progress and data-quality trends."],
};

// ---------- warehouse & pipelines ----------
const DAG={cols:[
  {t:"Bronze · raw",n:[["ingest_ticketing","Ticketing","hourly"],["ingest_gate_scans","Gate scans","stream"],["ingest_ratings_feed","Ratings feed","daily file"],["ingest_odds_stream","Odds","stream"],["ingest_ecommerce","E-commerce","CDC"],["ingest_streaming_subs","League+ subs","CDC"]]},
  {t:"Silver · staging",n:[["stg_tickets","stg_tickets",""],["stg_scans","stg_scans","dedupe re-entry"],["stg_viewership","stg_viewership",""],["stg_odds","stg_odds","validate lines"],["stg_fans","stg_fans","identity match"]]},
  {t:"Gold · marts",n:[["fact_game_attendance","fact_game_attendance",""],["fact_viewership","fact_viewership",""],["fact_ad_delivery","fact_ad_delivery",""],["fact_odds","fact_odds","live upsert"],["fact_merch_orders","fact_merch_orders",""],["dim_fan (Fan 360)","dim_fan","SCD 1"],["dim_team_scd","dim_team_scd","SCD 2"]]},
  {t:"Tests",n:[["dq_checks","Quality checks","gate before publish"]]},
  {t:"Semantic",n:[["semantic_refresh","Metric layer","certified KPIs"]]},
  {t:"BI",n:[["bi_extract_refresh","Dashboards","extracts"]]},
 ],edges:[["ingest_ticketing","stg_tickets"],["ingest_gate_scans","stg_scans"],["ingest_ratings_feed","stg_viewership"],["ingest_ecommerce","stg_fans"],["ingest_streaming_subs","stg_fans"],["ingest_odds_stream","stg_odds"],["stg_odds","fact_odds"],
  ["stg_tickets","fact_game_attendance"],["stg_scans","fact_game_attendance"],["stg_viewership","fact_viewership"],["stg_viewership","fact_ad_delivery"],["stg_fans","dim_fan (Fan 360)"],["stg_fans","fact_merch_orders"],
  ["fact_game_attendance","dq_checks"],["fact_viewership","dq_checks"],["fact_ad_delivery","dq_checks"],["fact_odds","dq_checks"],["fact_merch_orders","dq_checks"],["dim_fan (Fan 360)","dq_checks"],["dim_team_scd","dq_checks"],
  ["dq_checks","semantic_refresh"],["semantic_refresh","bi_extract_refresh"]],
 band:"Orchestrated with Airflow (MWAA) + dbt: incremental models, tests block publish on failure, lineage generated from the DAG, deploys through Git + CI."};
const PHYS={"fact_game_attendance":"Partition: season · Cluster: week, home_team_id","fact_viewership":"Partition: season · Cluster: week, platform","fact_ad_delivery":"Partition: season · Cluster: platform","fact_odds":"Upsert by game_id · 60 s SLA",
  "fact_merch_orders":"Partition: order month · Cluster: team_id","dim_fan (Fan 360)":"Cluster: fan_id · PII column masked","dim_team_scd":"valid_from / valid_to / is_current","stg_scans":"Dedupe on scan_id + gate + 30 s window","stg_odds":"Reject stale or out-of-range lines","stg_fans":"Deterministic + fuzzy identity match"};
const SEMANTIC=`metrics:
  - name: attendance_pct
    label: Attendance (% of capacity)
    type: ratio
    numerator:   { measure: scanned_attendance, agg: sum }
    denominator: { measure: capacity, agg: sum }
    model: fact_game_attendance
    dimensions: [season, week, conference, division, team, game_window]
    owner: SVP Club Business
    certified: true
    format: percent_1dp

  - name: cpm
    label: Cost per 1,000 impressions
    type: derived
    expr: 1000 * ad_spend / impressions
    model: fact_ad_delivery
    dimensions: [season, week, platform, network, game_window]
    owner: EVP Media
    certified: true

# One definition → Power BI, Tableau, SQL Lab and partner data shares all read it.`;
const SCD_SQL=`-- Point-in-time join: what surface was each game ACTUALLY played on?
-- dim_game.surface was overwritten (SCD type 1); dim_team_scd keeps history (type 2).
SELECT t.team, g.season, g.week, g.game_date,
       g.surface AS surface_recorded_type1,
       h.surface AS surface_at_game_time_type2,
       CASE WHEN g.surface <> h.surface THEN 'WRONG IN TYPE 1' ELSE '' END AS flag
FROM dim_game g
JOIN dim_team t     ON t.team_id = g.home_team_id
JOIN dim_team_scd h ON h.team_id = g.home_team_id
                   AND g.game_date >= h.valid_from
                   AND g.game_date <  h.valid_to
WHERE g.home_team_id IN (SELECT team_id FROM dim_team_scd WHERE is_current = 0)
  AND g.home_score IS NOT NULL
ORDER BY flag DESC, t.team, g.game_date;`;
const PRACTICES=[
  ["Model for the question","Star schema in Gold with documented grain; conformed dimensions (game, team, fan, date) shared by every fact."],
  ["Load incrementally","Merge only new/changed rows (CDC, watermarks); full refresh only for small dimensions."],
  ["Partition & cluster","Partition big facts by season, cluster by week / team – dashboards prune 90%+ of data."],
  ["Pre-aggregate hot paths","Aggregate tables / materialized views for the Monday exec scorecard; BI extracts for heavy dashboards, live query for small ones."],
  ["Test before publish","dbt tests + quality checks gate Gold; a failure blocks the semantic refresh instead of shipping bad numbers."],
  ["Keep history where it matters","SCD type 2 on teams/stadiums so injury-by-surface and pricing analyses use point-in-time truth."],
  ["Watch cost","Auto-suspend compute, right-size warehouses for game days, monitor credits per dashboard."],
];
NOTES.wh=["This is the warehouse view behind the dashboards: medallion layers, the orchestrated DAG, run history, physical design, SCD history and cost.","DAG: every node is colored by its last run – the ratings-feed failure three days ago was caught, rerun and never reached the dashboards because tests gate publishing.","SCD type 2: run the point-in-time query – five clubs changed surface or capacity, and type-1 history would mislabel their 2025 games. That matters for the injury-by-surface analysis.","Cost: clustering + aggregate tables on Nov 2 cut compute ~28% and query time ~45%. As a manager I own that trade-off between freshness, performance and cost."];
NOTES.kpi.push("Use 'View as' to show row-level security live: a club sees only its own data; a media partner doesn't see ticketing, merch, subscriber or health data.");
SAVED.push(["Point-in-time join with SCD type 2",SCD_SQL]);
SAVED.push(["Pipeline health – last 14 days",`SELECT layer,
       COUNT(*) AS runs,
       SUM(CASE WHEN status LIKE 'Success%' THEN 1 ELSE 0 END) AS succeeded,
       SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END)      AS failed,
       ROUND(AVG(duration_s), 0)                               AS avg_duration_s,
       SUM(rows_processed)                                     AS rows_processed
FROM etl_job_runs
GROUP BY layer
ORDER BY CASE layer WHEN 'Bronze' THEN 1 WHEN 'Silver' THEN 2 WHEN 'Gold' THEN 3 WHEN 'Semantic' THEN 4 ELSE 5 END;`]);

// ---------- Ask the data (rule-based prototype over certified metrics) ----------
const SEASON_OF=t=>/2025/.test(t)?2025:2026;
const CONF_OF=t=>/\bafc\b/.test(t)?"AFC":/\bnfc\b/.test(t)?"NFC":"";
const cw=(c,alias="t")=>c?`\n  AND ${alias}.conference = '${c}'`:"";
const ASK=[
  {id:"block_inj",test:/(injur|hurt|concussion).*(player|list|record|name|who|detail|each)|(player|who|which).*(injur|hurt)/,blocked:"health",
   msg:"Individual injury records are restricted health data – available only to Health & Safety, and only in aggregate elsewhere.",alt:"injury rate by surface"},
  {id:"block_pii",test:/(email|contact list|phone|address|export.*fan|fan.*(list|export|contact))/,blocked:"pii",
   msg:"Fan contact details are PII. They're masked for analytics roles and only released to the marketing activation tool for opted-in fans.",alt:"opted-in fans by segment"},
  {id:"inj_rate",noSeason:true,metric:"inj",label:"Injury rate per 1,000 plays by surface (aggregated)",test:/injur/,
   sql:t=>`WITH plays AS (SELECT season, surface, SUM(total_plays) AS plays FROM dim_game WHERE home_score IS NOT NULL GROUP BY season, surface),
inj AS (SELECT g.season, g.surface, COUNT(*) AS injuries FROM fact_injuries i JOIN dim_game g ON g.game_id = i.game_id GROUP BY g.season, g.surface)
SELECT p.season || ' · ' || p.surface AS season_surface,
       ROUND(1000.0 * i.injuries / p.plays, 2) AS injuries_per_1000_plays
FROM plays p JOIN inj i ON i.season = p.season AND i.surface = p.surface
ORDER BY p.season, p.surface;`,chart:"bar"},
  {id:"optin",noSeason:true,label:"Opted-in fans by segment (no PII)",test:/opt.?in|consent|marketable/,
   sql:t=>`SELECT segment, COUNT(*) AS fans, SUM(marketing_opt_in) AS opted_in,
       ROUND(100.0 * SUM(marketing_opt_in) / COUNT(*), 1) AS opt_in_pct
FROM dim_fan GROUP BY segment ORDER BY opted_in DESC;`,chart:"bar"},
  {id:"cpm",metric:"cpms",label:"Ad spend vs impressions – streaming vs network TV",test:/cpm|ad spend|impression|streaming vs|network vs|advertis/,
   sql:t=>`SELECT CASE WHEN d.platform = 'Streaming' THEN 'Streaming' ELSE 'Network TV' END AS channel,
       ROUND(SUM(d.impressions) / 1e9, 2) AS impressions_b,
       ROUND(SUM(d.ad_spend) / 1e6, 1) AS ad_spend_m,
       ROUND(1000.0 * SUM(d.ad_spend) / SUM(d.impressions), 2) AS cpm
FROM fact_ad_delivery d
JOIN dim_game g ON g.game_id = d.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE g.season = ${SEASON_OF(t)}${cw(CONF_OF(t))}
GROUP BY channel;`,chart:"bar",ys:[3]},
  {id:"att_trend",metric:"att",label:"Attendance % by week",test:/attendance.*(week|trend|over time)|(week|trend).*attendance/,
   sql:t=>`SELECT g.week, ROUND(100.0 * SUM(a.scanned_attendance) / SUM(a.capacity), 1) AS attendance_pct
FROM fact_game_attendance a
JOIN dim_game g ON g.game_id = a.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE g.season = ${SEASON_OF(t)}${cw(CONF_OF(t))}
GROUP BY g.week ORDER BY g.week;`,chart:"line"},
  {id:"att_div",metric:"att",label:"Attendance % by division",test:/attendance|sell.?out|capacity|crowd/,
   sql:t=>`SELECT t.division, ROUND(100.0 * SUM(a.scanned_attendance) / SUM(a.capacity), 1) AS attendance_pct
FROM fact_game_attendance a
JOIN dim_game g ON g.game_id = a.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE g.season = ${SEASON_OF(t)}${cw(CONF_OF(t))}
GROUP BY t.division ORDER BY attendance_pct DESC;`,chart:"bar"},
  {id:"tix",metric:"tix",label:"Ticket revenue by club",test:/ticket|gate revenue|box office/,
   sql:t=>`SELECT t.team, ROUND(SUM(a.ticket_revenue) / 1e6, 1) AS ticket_revenue_m
FROM fact_game_attendance a
JOIN dim_game g ON g.game_id = a.game_id
JOIN dim_team t ON t.team_id = g.home_team_id
WHERE g.season = ${SEASON_OF(t)}${cw(CONF_OF(t))}
GROUP BY t.team ORDER BY ticket_revenue_m DESC LIMIT 10;`,chart:"bar"},
  {id:"stream_share",metric:"view",label:"Streaming share of audience by week",test:/streaming share|share.*stream|stream.*grow|cord/,
   sql:t=>`SELECT g.week,
       ROUND(100.0 * SUM(CASE WHEN v.platform = 'Streaming' THEN v.avg_viewers_m ELSE 0 END) / SUM(v.avg_viewers_m), 1) AS streaming_share_pct
FROM fact_viewership v JOIN dim_game g ON g.game_id = v.game_id
WHERE g.season = ${SEASON_OF(t)}
GROUP BY g.week ORDER BY g.week;`,chart:"line"},
  {id:"window",metric:"view",label:"Average viewers by kickoff window",test:/primetime|window|thursday|sunday|monday|kickoff/,
   sql:t=>`WITH per_game AS (SELECT g.game_id, g.game_window, SUM(v.avg_viewers_m) AS viewers_m
  FROM fact_viewership v JOIN dim_game g ON g.game_id = v.game_id JOIN dim_team t ON t.team_id = g.home_team_id
  WHERE g.season = ${SEASON_OF(t)}${cw(CONF_OF(t))} GROUP BY g.game_id)
SELECT game_window, COUNT(*) AS games, ROUND(AVG(viewers_m), 1) AS avg_viewers_m
FROM per_game GROUP BY game_window ORDER BY avg_viewers_m DESC;`,chart:"bar",ys:[2]},
  {id:"views",metric:"view",label:"Average viewers per game by week",test:/viewer|audience|ratings|watch/,
   sql:t=>`WITH per_game AS (SELECT g.week, g.game_id, SUM(v.avg_viewers_m) AS viewers_m
  FROM fact_viewership v JOIN dim_game g ON g.game_id = v.game_id JOIN dim_team t ON t.team_id = g.home_team_id
  WHERE g.season = ${SEASON_OF(t)}${cw(CONF_OF(t))} GROUP BY g.game_id)
SELECT week, ROUND(AVG(viewers_m), 2) AS avg_viewers_m FROM per_game GROUP BY week ORDER BY week;`,chart:"line"},
  {id:"merch",metric:"merch",label:"Merchandise revenue by club (fan panel)",test:/merch|jersey|apparel|store/,
   sql:t=>`SELECT t.team, ROUND(SUM(m.revenue), 0) AS merch_revenue
FROM fact_merch_orders m JOIN dim_team t ON t.team_id = m.team_id
WHERE m.order_date LIKE '${SEASON_OF(t)}%'${cw(CONF_OF(t))}
GROUP BY t.team ORDER BY merch_revenue DESC LIMIT 10;`,chart:"bar"},
  {id:"subs",metric:"subs",label:"Active League+ subscribers by fan segment",test:/subscri|league\+|league plus|churn/,
   sql:t=>`SELECT f.segment, COUNT(*) AS active_subscribers,
       SUM(CASE WHEN s.plan = 'Premium' THEN 1 ELSE 0 END) AS premium
FROM fact_subscriptions s JOIN dim_fan f ON f.fan_id = s.fan_id
WHERE s.end_date IS NULL
GROUP BY f.segment ORDER BY active_subscribers DESC;`,chart:"bar",ys:[1],note:"For who is likely to churn, see the Churn model page."},
  {id:"odds",noSeason:true,label:"Week 11 – biggest line moves since open",test:/\bodds\b|\blines?\b|spread|betting|favorite|week 11/,
   sql:t=>`SELECT a.team || ' @ ' || h.team AS matchup,
       o.open_spread, o.current_spread,
       ABS(o.current_spread - o.open_spread) AS points_moved
FROM fact_odds o JOIN dim_game g ON g.game_id = o.game_id
JOIN dim_team h ON h.team_id = g.home_team_id JOIN dim_team a ON a.team_id = g.away_team_id
WHERE g.season = 2026 AND g.week = 11
ORDER BY points_moved DESC LIMIT 8;`,chart:"bar",ys:[3]},
  {id:"dq",label:"Data-quality checks failing right now",test:/quality|failing|broken|issue|incident/,dq:true},
  {id:"pipe",noSeason:true,label:"Pipeline health – last 14 days by layer",test:/pipeline|job|etl|load|run/,
   sql:t=>`SELECT layer, COUNT(*) AS runs,
       SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) AS failed,
       ROUND(AVG(duration_s), 0) AS avg_duration_s
FROM etl_job_runs GROUP BY layer
ORDER BY CASE layer WHEN 'Bronze' THEN 1 WHEN 'Silver' THEN 2 WHEN 'Gold' THEN 3 WHEN 'Semantic' THEN 4 ELSE 5 END;`,chart:"bar",ys:[1]},
];
const ASK_SUGGEST=["Attendance by division in 2026","Streaming vs network CPM","Average viewers by kickoff window","Top clubs by merch revenue","Biggest line moves this week","Which players were injured?","Export fan emails","What data-quality checks are failing?"];

// ---------- League+ churn model (illustrative, fixed coefficients) ----------
const CHURN_MODEL={version:"churn-lplus v1.3",trained:"2024–25 subscriber cohorts",owner:"Data Science & Analytics",refresh:"Nightly batch scoring → gold.fact_churn_scores",
  intercept:-1.05,coef:{basic_plan:1.25,casual_segment:.62,streaming_first:-.45,season_ticket:-.38,out_of_market:.74,merch_spend_log:-.42},
  labels:{basic_plan:"Basic plan",casual_segment:"Casual fan",streaming_first:"Streaming-first fan",season_ticket:"Season-ticket holder",out_of_market:"Out-of-market fan",merch_spend_log:"Merch spend"}};

// ---------- guided tour ----------
const TOUR=[
  {tab:"overview",sel:"#ovArch",text:"AWS reference architecture: sources → Kinesis/AppFlow → S3 → dbt on Redshift → semantic layer → Tableau/QuickSight. Click any service for the why and the cost."},
  {tab:"brief",sel:"#brAnom",text:"Monday Exec Brief, generated automatically. Anomaly detection flagged Week 8 streaming viewership – the ad server shows normal delivery, so it's a ratings-feed outage, not lost audience."},
  {tab:"kpi",sel:"#kpis",text:"Certified KPIs: every tile has an owner, a definition and its SQL behind ⓘ. Streaming carries a higher CPM than network TV."},
  {tab:"kpi",sel:"#fView",text:"View as: row-level security live. A club sees only its own data; a media partner can't see ticketing, merch, subscriber or health data."},
  {tab:"ask",sel:"#askWrap",text:"Ask the data: natural-language questions answered from certified metrics, with the SQL shown. Ask for player injuries or fan emails and policy blocks it."},
  {tab:"churn",sel:"#chTop",text:"Data science → BI: the churn model's scores become risk tiers, revenue at risk and a target list Marketing can act on – with a model card."},
  {tab:"wh",sel:"#whDag",text:"Pipelines: each step colored by its last run. Quality tests gate publishing, so failures never reach a dashboard."},
  {tab:"gov",sel:"#dqTable",text:"Governance: quality checks run live – including the ratings-vs-ad-server reconciliation that caught the Week 8 feed outage."},
  {tab:"roadmap",sel:"#rmBoard",text:"Roadmap: Now / Next / Later, ranked by RICE, a success metric on every item, sequenced around the football calendar."},
];
NOTES.brief=["The Monday pack writes itself: week-over-week movers, top and bottom clubs, quality incidents and anomalies – computed from the certified metrics.","Anomaly detection: each weekly metric vs. its trailing 4-week mean and standard deviation; flag beyond 2.5 standard deviations.","Week 8 streaming viewership is flagged – but ad-server impressions for that game were normal, and the reconciliation check fails. Diagnosis: a partner ratings-feed outage, not audience loss. That's the BI-meets-data-science story.","Print / Save as PDF produces the exec handout."];
NOTES.ask=["Self-service for non-SQL users: a question maps to a certified metric, generates governed SQL, and charts the result.","Guardrails: ask 'which players were injured?' or 'export fan emails' – policy blocks it with the reason and offers the allowed aggregate.","It respects 'View as' – switch to Media partner on the KPI page and ticketing questions are blocked.","Honest framing: this is a rule-based prototype. In production, Amazon Bedrock grounded on the semantic layer, with Lake Formation permissions enforced."];
NOTES.churn=["The data science team builds the model; my job is getting the scores into a certified Gold table and a dashboard Marketing actually uses.","Risk tiers, revenue at risk, and the drivers that explain each score – Basic plan and out-of-market fans churn most; merch buyers stay.","AUC is computed live against 2024–25 outcomes; the model card shows version, owner, refresh and drift status.","The target list exports fan IDs only – contact details resolve in the activation tool for opted-in fans."];

/* ---------- morning additions ---------- */
const PLAN90=[
  {when:"Days 1–30",title:"Listen & baseline",items:[
    ["Meet every product owner, the data science team, data engineering, governance and two club business teams – a stakeholder map and a pain-point log","adopt"],
    ["Inventory dashboards and KPIs; find the duplicate and conflicting definitions","kpi"],
    ["Baseline adoption, data-quality pass rate, pipeline reliability and warehouse cost","wh"],
    ["Learn the AWS footprint, the release process and the game-day change freeze","overview"]],
   deliv:"“State of BI” readout · top 10 KPIs agreed with their owners"},
  {when:"Days 31–60",title:"Certify & stabilize",items:[
    ["Certify the top 10 KPIs in the semantic layer – one definition, an owner, SQL behind every number","kpi"],
    ["Quality checks and data contracts on the three critical feeds: ratings, odds, ticketing","gov"],
    ["Quick win: the automated Monday exec brief with anomaly alerts","brief"],
    ["Publish the roadmap ranked with RICE and sign it off with stakeholders","roadmap"]],
   deliv:"Certified scorecard live · roadmap signed off · incidents caught before execs see them"},
  {when:"Days 61–90",title:"Scale & self-serve",items:[
    ["Self-service pilot: “Ask the data” with one business team on certified metrics","ask"],
    ["First data-science score in a certified dashboard Marketing uses (League+ churn)","churn"],
    ["Club row-level security pilot with the 12 SSO-ready clubs","kpi"],
    ["Fan 360 identity-resolution plan, scheduled for the off-season","fan"]],
   deliv:"Self-service growing · monthly leadership readout cadence running"}];
const PLAN_KPIS=[["Self-service share","≥ 40%","of queries by business users"],["Certified KPI quality","100%","checks passing on certified metrics"],["Exec-found data errors","0","we find them first"],["Pipeline SLA","≥ 99.5%","on-time Gold loads"]];
const PLAN_PARTNERS=[
  ["Data Science & Analytics","Weekly model → BI sync · shared feature and metric definitions · model cards in the catalog","Scores land in certified tables, not spreadsheets"],
  ["Delivery leadership","Biweekly status with a RAID log · monthly roadmap readout · quarterly exec review","No surprises: risks raised early with options"],
  ["Product owners & business teams","Intake → RICE scoring in the open · sprint reviews · UAT before the certified badge","They see why something is Now, Next or Later"],
  ["Data engineering & governance","Data contracts on every feed · certification checklist · change freeze on game days","Bad data stopped at the door"]];
const DATA_CONTRACT=`contract: odds_feed            # licensed consensus odds
version: 2.1  ·  owner: Media Data Eng
compatibility: BACKWARD        # Glue Schema Registry
fields:
  game_id:        {type: int,    required: true}
  spread:         {type: decimal, required: true}
  total:          {type: decimal, required: true}
  home_moneyline: {type: int,    required: true}
  away_moneyline: {type: int,    required: true}
  updated_at:     {type: timestamp, required: true}
rules:
  - moneyline favorite matches spread sign
  - freshness < 60 s during game windows
on_violation: quarantine batch, keep last good lines,
              alert #data-odds-feed, open vendor ticket`;
NOTES.fan=["The hard part of Fan 360: one fan, four systems, four IDs and messy emails. Naive counting overstates the fan base.","Three passes: exact email, normalized email (case, spaces, +tags), then fuzzy matching blocked on stable tokens with a confidence score.","High confidence auto-merges; the middle band goes to a data steward – humans stay in the loop where it matters.","The payoff: once identities join, you can see that subscribers who also shop churn far less – that's the input the churn model and Marketing need.","Production: AWS Entity Resolution feeding a Gold identity graph; it's on the roadmap for the off-season."];
NOTES.plan=["Close with this: how I'd actually run the role, in three phases – listen, certify, scale.","Every item links to something in the demo, so it's evidence, not a slide.","Targets are outcomes: self-service share, quality on certified KPIs, zero exec-found errors, pipeline SLA.","Operating rhythm with each partner – including how I'd work with the data science team and delivery leadership."];
NOTES.gov.push("Data contract: click 'Simulate vendor schema change' – the batch is quarantined, last good lines keep serving, the Odds page shows the hold, and the right people are alerted. Bad data stopped at the door.");
NOTES.odds.push("Feed health strip: freshness vs the 60-second SLA, stream lag and records per minute – what the on-call engineer watches on game day.");
NOTES.brief.push("The alert that fired: CloudWatch alarm → SNS → Slack via AWS Chatbot. Routing by severity – Sev 1 pages the on-call engineer and annotates the brief.");
NOTES.kpi.push("What-if: drag the streaming CPM – delivered impressions stay fixed, so you see revenue sensitivity to the rate card instantly.");
TOUR.splice(TOUR.length-1,0,{tab:"gov",sel:"#dcWrap",text:"Data contracts: simulate the odds vendor renaming a field. The batch is quarantined, last good lines keep serving, and the right people are alerted – before any dashboard breaks."},
  {tab:"fan",sel:"#fiStats",text:"Fan 360: the same fan appears in four systems. Identity resolution turns records into golden fans – and reveals that subscribers who also shop churn far less."});
TOUR.push({tab:"plan",sel:"#planCols",text:"How I'd run this role: listen, certify, scale – every step linked to something you've just seen."});

/* ---------- International Fan Journey (See / Know / Engage) ---------- */
// Periods compare with the same weeks of 2025. week_start is the Thursday that opens each game week.
const INTL_PERIODS={
  std:{label:"2026 season to date (Wks 1–10)",start:"2026-09-10",end:"2026-11-12",prior:{start:"2025-09-04",end:"2025-11-06"}},
  l4:{label:"Last 4 weeks (Wks 7–10)",start:"2026-10-22",end:"2026-11-12",prior:{start:"2025-10-16",end:"2025-11-06"}},
  lq:{label:"Last quarter (13 weeks)",start:"2026-08-20",end:"2026-11-12",prior:{start:"2025-08-14",end:"2025-11-06"}},
};
// survey quarters that overlap a date range, e.g. 2026-09-10..2026-11-12 → ['2026-Q3','2026-Q4']
function intlQuarters(start,end){const out=[];let y=+start.slice(0,4),q=Math.ceil(+start.slice(5,7)/3);const ey=+end.slice(0,4),eq=Math.ceil(+end.slice(5,7)/3);
  while(y<ey||(y===ey&&q<=eq)){out.push(`${y}-Q${q}`);if(++q>4){q=1;y++}}return out}
// filters: f = {start, end, mkt, team, quarters}
function intlWhere(f,a="x"){return [`${a}.week_start BETWEEN '${f.start}' AND '${f.end}'`,...(f.mkt?[`${a}.market_id = ${f.mkt}`]:[]),...(f.team?[`${a}.team_id = ${f.team}`]:[])].join("\n  AND ")}
// one KPI over one fact table; byWeek adds the weekly series used for the sparkline
const intlSql=(tbl,expr,extra="")=>(f,byWeek)=>`SELECT ${byWeek?"x.week_start, ":""}${expr} AS value
FROM ${tbl} x
WHERE ${intlWhere(f)}${extra}${byWeek?"\nGROUP BY x.week_start\nORDER BY x.week_start":""};`;
const INTL_STAGES={
  see:{name:"See",sub:"Awareness",q:"Do fans in this market know the league and the club?"},
  know:{name:"Know",sub:"Consideration",q:"Have they raised a hand – downloaded, registered, opted in?"},
  engage:{name:"Engage",sub:"Conversion",q:"Are they buying, attending and subscribing – and coming back?"},
};
const IO={see:["VP International Media","International Media Analytics","Daily (social, ad and partner feeds)"],know:["VP Fan Data & Marketing","Fan Data Steward","Daily 6:00 AM"],
  engage:["SVP International Business","International Commercial Analytics","Daily · international games game day + 48 h"]};
const INTL_KPIS=[
  {id:"reach",stage:"see",label:"Reach",fmt:"cnt",src:"fact_market_awareness",
   def:"People reached each week across social, broadcast, streaming and paid digital, summed over the weeks in the period (gross weekly reach).",
   sql:intlSql("fact_market_awareness","SUM(x.reach)")},
  {id:"imps",stage:"see",label:"Impressions",fmt:"cnt",src:"fact_market_awareness",
   def:"Content and ad impressions delivered to people in the market across all four channels.",
   sql:intlSql("fact_market_awareness","SUM(x.impressions)")},
  {id:"viewers",stage:"see",label:"Broadcast + streaming viewers",fmt:"cnt",src:"fact_market_awareness",
   def:"People who watched games or league programming through international broadcast partners or League+ International, summed by week.",
   sql:intlSql("fact_market_awareness","SUM(x.reach)","\n  AND x.channel IN ('Broadcast', 'Streaming')")},
  {id:"followers",stage:"see",label:"Social follower growth",fmt:"cnt",src:"fact_market_awareness",
   def:"Net new followers of league and club social accounts from the market.",
   sql:intlSql("fact_market_awareness","SUM(x.social_followers_gained)")},
  {id:"cpm",stage:"see",label:"CPM (paid media)",fmt:"money2",inverse:true,src:"fact_market_awareness",
   def:"Ad spend ÷ impressions × 1,000 on paid channels (paid digital and promoted social). Broadcast and streaming impressions come through rights partners and carry no spend. Lower is better.",
   sql:intlSql("fact_market_awareness","ROUND(1000.0 * SUM(x.ad_spend) / SUM(x.impressions), 2)","\n  AND x.ad_spend > 0")},
  {id:"aided",stage:"see",label:"Aided awareness",fmt:"pct",src:"fact_brand_survey",owner:["VP International Media","International Brand Research","Quarterly brand tracker"],
   def:"Share of adults who recognize the league (Club = All) or the selected club when prompted, from the quarterly brand tracker. Markets are weighted by population; quarters that overlap the period are averaged.",
   sql:(f,byQuarter)=>`SELECT ${byQuarter?"x.quarter, ":""}ROUND(SUM(x.aided_awareness_pct * m.population_m) / SUM(m.population_m), 1) AS value
FROM fact_brand_survey x
JOIN dim_market m ON m.market_id = x.market_id
WHERE ${byQuarter?`x.quarter <= '${f.quarters[f.quarters.length-1]}'`:`x.quarter IN (${f.quarters.map(q=>`'${q}'`).join(", ")})`}
  AND ${f.team?`x.team_id = ${f.team}`:"x.team_id IS NULL"}${f.mkt?`\n  AND x.market_id = ${f.mkt}`:""}${byQuarter?"\nGROUP BY x.quarter\nORDER BY x.quarter":""};`},
  {id:"installs",stage:"know",label:"App installs",fmt:"cnt",src:"fact_market_consideration",
   def:"New installs of the league and club apps from the market's app stores.",
   sql:intlSql("fact_market_consideration","SUM(x.app_installs)")},
  {id:"registered",stage:"know",label:"Registered / identified fans",fmt:"cnt",src:"fact_market_consideration",
   def:"New fan accounts (league ID, app, ticketing or League+) created in the period and resolved to one Fan 360 ID. The middle of the funnel.",
   sql:intlSql("fact_market_consideration","SUM(x.registered_fans)")},
  {id:"optin",stage:"know",label:"Email opt-in rate",fmt:"pct",src:"fact_market_consideration",
   def:"Email opt-ins ÷ newly registered fans. Consent is captured under each market's privacy law.",
   sql:intlSql("fact_market_consideration","ROUND(100.0 * SUM(x.email_opt_ins) / SUM(x.registered_fans), 1)")},
  {id:"engrate",stage:"know",label:"Content engagement rate",fmt:"pct2",src:"fact_market_consideration + fact_market_awareness",
   def:"Content engagements (likes, shares, comments, video completes) ÷ impressions in the same weeks.",
   sql:(f,byWeek)=>`WITH c AS (
  SELECT x.week_start, SUM(x.content_engagements) AS engagements
  FROM fact_market_consideration x
  WHERE ${intlWhere(f).replace(/\n  /g,"\n    ")}
  GROUP BY x.week_start
), a AS (
  SELECT x.week_start, SUM(x.impressions) AS impressions
  FROM fact_market_awareness x
  WHERE ${intlWhere(f).replace(/\n  /g,"\n    ")}
  GROUP BY x.week_start
)
SELECT ${byWeek?"c.week_start, ":""}ROUND(100.0 * SUM(c.engagements) / SUM(a.impressions), 2) AS value
FROM c
JOIN a ON a.week_start = c.week_start${byWeek?"\nGROUP BY c.week_start\nORDER BY c.week_start":""};`},
  {id:"trials",stage:"know",label:"Streaming trials",fmt:"cnt",src:"fact_market_consideration",
   def:"Free trials of League+ International started by fans in the market.",
   sql:intlSql("fact_market_consideration","SUM(x.streaming_trials)")},
  {id:"attendance",stage:"engage",label:"International game attendance",fmt:"cnt",src:"fact_market_engagement + bridge_game_market",
   def:"Scanned attendance at league games played in the market (see bridge_game_market), attributed to clubs by the fans' club affinity. Zero in markets with no game in the period.",
   sql:intlSql("fact_market_engagement","SUM(x.intl_game_attendance)")},
  {id:"tickets",stage:"engage",label:"Ticket purchases",fmt:"cnt",src:"fact_market_engagement",
   def:"Tickets bought by fans resident in the market – international games plus travel to home games.",
   sql:intlSql("fact_market_engagement","SUM(x.intl_game_tickets)")},
  {id:"merch",stage:"engage",label:"Merch revenue",fmt:"money",src:"fact_market_engagement",
   def:"Merchandise revenue from orders shipped to the market (league and club stores), in USD.",
   sql:intlSql("fact_market_engagement","SUM(x.merch_revenue)")},
  {id:"subs",stage:"engage",label:"Paid league subscriptions",fmt:"cnt",src:"fact_market_engagement",
   def:"New paid League+ International subscriptions started in the period.",
   sql:intlSql("fact_market_engagement","SUM(x.paid_subscriptions)")},
  {id:"repeat",stage:"engage",label:"Repeat-engaged fans",fmt:"pct",src:"fact_market_engagement",
   def:"Share of engaged fans (ticket, merch, subscription or attendance) who had engaged before – the loyalty signal.",
   sql:intlSql("fact_market_engagement","ROUND(100.0 * SUM(x.repeat_engaged_fans) / SUM(x.engaged_fans), 1)")},
];
INTL_KPIS.forEach(k=>{if(!k.owner)k.owner=IO[k.stage]});
// funnel by any grouping: [] = one row, ["market_id"] = by market, ["team_id","market_id"] = club × market
function intlFunnelSql(f,by=[]){
  const g=by.length?by.map(c=>"x."+c).join(", "):"",sel=g?g+", ":"",grp=g?`\n  GROUP BY ${g}`:"",w=intlWhere(f).replace(/\n  /g,"\n    ");
  const on=t=>by.length?by.map(c=>`${t}.${c} = a.${c}`).join(" AND "):"1 = 1";
  return `WITH a AS (
  SELECT ${sel}SUM(x.reach) AS reach FROM fact_market_awareness x
  WHERE ${w}${grp}
), k AS (
  SELECT ${sel}SUM(x.registered_fans) AS registered FROM fact_market_consideration x
  WHERE ${w}${grp}
), e AS (
  SELECT ${sel}SUM(x.engaged_fans) AS engaged FROM fact_market_engagement x
  WHERE ${w}${grp}
)
SELECT ${by.map(c=>"a."+c+", ").join("")}a.reach, k.registered, e.engaged,
       ROUND(100.0 * k.registered / a.reach, 2) AS see_to_know_pct,
       ROUND(100.0 * e.engaged / k.registered, 1) AS know_to_engage_pct,
       ROUND(100.0 * e.engaged / a.reach, 3) AS overall_pct
FROM a
JOIN k ON ${on("k")}
JOIN e ON ${on("e")};`;
}
// football calendar for 2027: off-season = platform changes allowed; in season = game-day freeze Thu–Mon
const INTL_CAL=[["Jan","post"],["Feb","off"],["Mar","off"],["Apr","off"],["May","off"],["Jun","off"],["Jul","off"],["Aug","pre"],["Sep","season"],["Oct","season"],["Nov","season"],["Dec","season"]];
const INTL_CAL_KEY={post:["Postseason","full change freeze"],off:["Off-season","platform migrations allowed"],pre:["Pre-season","releases Tue/Wed"],season:["Season","game-day freeze Thu–Mon · releases Tue/Wed"]};
const INTL_ROADMAP=[
  {n:1,t:"Source international signals",when:"Q1 2027 · off-season",from:2,to:3,stages:["see"],owner:"Data Eng",
   d:"Ingest social platforms, ad platforms, app analytics, international ticketing and broadcast partner data. Starts after the postseason freeze lifts in February.",
   deps:"Broadcast partner data-sharing terms; ad-platform API access",risk:"Partners share only aggregated viewership",metric:"6 core markets × 4 source types landing daily in Bronze/Silver (Ireland and Spain follow)"},
  {n:2,t:"Resolve international fans into Fan 360",when:"Q1–Q2 2027 · off-season",from:3,to:5,stages:["know"],owner:"Data Eng + Governance",
   d:"Extend identity resolution to international sources, with consent handled per local privacy law (GDPR, LGPD, PIPEDA).",
   deps:"Privacy/consent review per market; Fan 360 matching rules",risk:"Consent gaps block matching in some markets",metric:"60% of international registered fans matched to one ID"},
  {n:3,t:"Certify the funnel KPIs",when:"Q2 2027 · off-season",from:5,to:6,stages:["see","know","engage"],owner:"BI + League International",
   d:"Definitions agreed with the clubs and League International and published on the semantic layer – the 16 tiles above, with owner and lineage.",
   deps:"Phase 1–2 data in Silver; club definition workshop",risk:"Clubs disagree on what counts as \"engaged\"",metric:"16 KPIs certified with owner and lineage"},
  {n:4,t:"Club and league dashboards",when:"Pre-season 2027 · live by Week 1",from:7,to:8,stages:["see","know","engage"],owner:"BI + Governance",
   d:"This tab, rolled out with club row-level security so each club sees its own markets plus league benchmarks. Releases on Tue/Wed only.",
   deps:"Club SSO onboarding; certified KPIs (phase 3)",risk:"Club SSO onboarding (12 of 32 done today)",metric:"32 clubs active weekly"},
  {n:5,t:"Activate and engage",when:"2027 season onward",from:9,to:12,stages:["engage"],owner:"Marketing + League International",live:"growthK2E",
   d:"Push funnel-stage audiences to marketing for campaigns in each market, and measure lift per market against holdouts. Audience pushes run Tue/Wed – no pipeline changes on game days.",
   deps:"Opted-in audiences from Fan 360; campaign holdout design",risk:"Lift is hard to isolate from international game halo",metric:"Know→Engage conversion +2 pts in Growth markets"},
];
const INTL_DEPS=[
  ["Resolve international fans into Fan 360","Privacy/consent review per market (GDPR for UK, Ireland, Germany, Spain; LGPD Brazil; PIPEDA Canada; Australia Privacy Act; Mexico LFPDPPP)","Governance + Legal","High","One GDPR review covers four markets; match only consented records; market-by-market sign-off before go-live"],
  ["Source international signals","Broadcast partner data-sharing terms (viewer-level vs aggregated data)","Media + Legal","High","Start with aggregated weekly viewership; add viewer-level terms at each partner's renewal"],
  ["Club and league dashboards","Club SSO onboarding (IT + clubs)","Governance","High","Weekly club onboarding tracker; pilot with 12 onboarded clubs first"],
  ["Certify the funnel KPIs","Timezone and late-arriving data for international game-day feeds (London, Munich kick off in local evening)","Data Eng","Medium","Store UTC + local time; 48-hour late-arrival window before game-week numbers are certified; game-day views marked provisional"],
  ["Certify the funnel KPIs","Club agreement on definitions (registered vs engaged fan)","BI","Medium","Definition workshop with six pilot clubs; decision owner: SVP International Business"],
  ["All phases","Game-day change freeze (Thu–Mon), postseason freeze and the off-season migration rule","Delivery","Medium","Platform work (phases 1–3) in the off-season; dashboard and campaign releases Tue/Wed only"],
];
const ERD_INTL={
  tables:{
    fact_market_awareness:{x:30,y:20,desc:"See. Grain: one row per market × week × club × channel (Social, Broadcast, Streaming, Paid digital). Source: social, ad-platform and broadcast-partner feeds.",owner:"League International",cols:[["market_id","int","FK"],["week_start","text"],["team_id","int","FK"],["channel","text"],["reach","int"],["impressions","int"],["ad_spend","real"],["video_views","int"],["social_followers_gained","int"]]},
    fact_market_consideration:{x:30,y:265,desc:"Know. Grain: one row per market × week × club. Fan counts from app analytics and Fan 360 registrations.",owner:"League International",cols:[["market_id","int","FK"],["week_start","text"],["team_id","int","FK"],["app_installs","int"],["registered_fans","int"],["email_opt_ins","int"],["content_engagements","int"],["streaming_trials","int"]]},
    fact_brand_survey:{x:30,y:470,desc:"See. Grain: one row per market × quarter × club; team_id NULL is the league brand. Source: quarterly brand tracker.",owner:"League International",cols:[["market_id","int","FK"],["quarter","text"],["team_id","int","FK"],["sample_n","int"],["aided_awareness_pct","real"],["unaided_awareness_pct","real"],["favorability_pct","real"]]},
    dim_market:{x:445,y:20,desc:"International markets and the league's presence tier in each (Established, Growth, Emerging).",owner:"League International",cols:[["market_id","int","PK"],["country","text"],["region","text"],["iso2","text"],["timezone","text"],["population_m","real"],["league_presence","text"]]},
    dim_team:{x:445,y:250,desc:"Shared club dimension – the same table the domestic star schema uses.",owner:"Club Business",cols:[["team_id","int","PK"],["team","text"],["conference","text"],["division","text"],["market_size","text"]]},
    bridge_game_market:{x:445,y:430,desc:"Which games were played in an international market, and where. Links dim_game to dim_market without changing dim_game.",owner:"League International",cols:[["game_id","int","PK"],["market_id","int","FK"],["venue","text"],["city","text"],["venue_capacity","int"]]},
    fact_market_engagement:{x:860,y:20,desc:"Engage. Grain: one row per market × week × club. Tickets, international game attendance, merch and League+ International subscriptions.",owner:"League International",cols:[["market_id","int","FK"],["week_start","text"],["team_id","int","FK"],["intl_game_tickets","int"],["intl_game_attendance","int"],["merch_orders","int"],["merch_revenue","real"],["paid_subscriptions","int"],["repeat_engaged_fans","int"],["engaged_fans","int"]]},
    dim_game:{x:860,y:330,desc:"Shared game dimension – international games are flagged through bridge_game_market.",owner:"Football Operations",cols:[["game_id","int","PK"],["season","int"],["week","int"],["game_date","text"],["home_team_id","int","FK"],["away_team_id","int","FK"]]},
  },
  rels:[["fact_market_awareness","market_id","dim_market","market_id"],["fact_market_awareness","team_id","dim_team","team_id"],
    ["fact_market_consideration","market_id","dim_market","market_id"],["fact_market_consideration","team_id","dim_team","team_id"],
    ["fact_brand_survey","market_id","dim_market","market_id"],["fact_brand_survey","team_id","dim_team","team_id"],
    ["fact_market_engagement","market_id","dim_market","market_id"],["fact_market_engagement","team_id","dim_team","team_id"],
    ["bridge_game_market","market_id","dim_market","market_id"],["bridge_game_market","game_id","dim_game","game_id"],["dim_game","home_team_id","dim_team","team_id"]],
  height:650
};
CATALOG.push(
  ["dim_market","Gold","League International","International Data Steward","Public","On change",false],
  ["fact_market_awareness","Gold","League International","International Media Analytics","Internal","Daily",false],
  ["fact_market_consideration","Gold","League International","Fan Data Steward","Confidential","Daily 6 AM",false],
  ["fact_market_engagement","Gold","League International","International Commercial Analytics","Confidential","Daily · intl games + 48 h",false],
  ["fact_brand_survey","Gold","League International","International Brand Research","Internal","Quarterly",false],
  ["bridge_game_market","Gold","League International","Football Ops Data","Internal","On change",false]);
SAVED.push(
  ["International funnel conversion by market",`-- See → Know → Engage by market, 2026 season to date (Weeks 1–10)
${intlFunnelSql({start:"2026-09-10",end:"2026-11-12"},["market_id"]).replace(/^SELECT a\.market_id, /m,"SELECT m.country, m.league_presence, ").replace(/;$/,"\nJOIN dim_market m ON m.market_id = a.market_id\nORDER BY overall_pct DESC;")}`],
  ["Top clubs by registered international fans",`-- New registered international fans per club, 2026 season to date, with each club's strongest market
WITH club_market AS (
  SELECT c.team_id, m.country, SUM(c.registered_fans) AS registered
  FROM fact_market_consideration c
  JOIN dim_market m ON m.market_id = c.market_id
  WHERE c.week_start BETWEEN '2026-09-10' AND '2026-11-12'
  GROUP BY c.team_id, m.country
), ranked AS (
  SELECT club_market.*,
         RANK() OVER (PARTITION BY team_id ORDER BY registered DESC) AS rk,
         SUM(registered) OVER (PARTITION BY team_id) AS total_registered
  FROM club_market
)
SELECT t.team, r.total_registered AS registered_fans,
       r.country AS top_market, r.registered AS top_market_fans,
       ROUND(100.0 * r.registered / r.total_registered, 1) AS top_market_share_pct
FROM ranked r
JOIN dim_team t ON t.team_id = r.team_id
WHERE r.rk = 1
ORDER BY registered_fans DESC
LIMIT 10;`]);
NOTES.intl=["Framing: clubs are the business users, and the league international team compares them. I start from the end goal – Engage – and work backward: what has to be true in Know and See for a fan in Mexico or Germany to buy, attend or subscribe?",
  "Top KPIs per stage: See = reach, impressions, broadcast + streaming viewers, follower growth, CPM and aided awareness; Know = app installs, registered fans, opt-in rate, content engagement and streaming trials; Engage = international game attendance, tickets, merch, paid subscriptions and repeat engagement. Every tile is SQL against the warehouse – tap ⓘ.",
  "The view a club actually uses is conversion from one stage to the next in each market. The market table names the weaker step against the league benchmark – Brazil has reach but leaks at See→Know; Germany registers fans but leaks at Know→Engage. Click a market, then a heatmap cell, to drill to one club in one market.",
  "Roadmap: sources → Fan 360 identity → certified KPIs → club dashboards → activation, timed to the football calendar so platform work lands in the off-season. The main risk is privacy and consent per market (GDPR, LGPD, PIPEDA) – it gates identity resolution, so it starts first."];
TOUR.splice(TOUR.length-1,0,{tab:"intl",sel:"#iStages",text:"International Fan Journey: See / Know / Engage KPIs for every club in every market, ordered from the end goal back – with stage-to-stage conversion by market and the roadmap to deliver it."});
