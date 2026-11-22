// Builds a deterministic, fully synthetic pro-football league warehouse in SQLite (sql.js).
// Fictional franchises; not affiliated with or sourced from any league or club.
function buildWarehouse(SQL){
  const db=new SQL.Database();
  let seed=20261118;
  const r=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const pick=a=>a[Math.floor(r()*a.length)];
  const wpick=(items,weights)=>{let x=r()*weights.reduce((a,b)=>a+b,0);for(let i=0;i<items.length;i++){x-=weights[i];if(x<=0)return items[i]}return items[items.length-1]};
  const between=(a,b)=>a+Math.floor(r()*(b-a+1));
  const pad=n=>String(n).padStart(2,"0");
  const iso=d=>d.getUTCFullYear()+"-"+pad(d.getUTCMonth()+1)+"-"+pad(d.getUTCDate());
  const dkey=s=>+s.replace(/-/g,"");
  const day=864e5, AS_OF=Date.UTC(2026,10,17);
  const poisson=l=>{const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r()}while(p>L);return k-1};

  db.run(`
  CREATE TABLE dim_date(date_key INTEGER PRIMARY KEY, date TEXT, year INTEGER, quarter TEXT, month INTEGER, month_name TEXT, day_of_week TEXT);
  CREATE TABLE dim_team(team_id INTEGER PRIMARY KEY, team TEXT, city TEXT, state TEXT, conference TEXT, division TEXT, stadium_capacity INTEGER, market_size TEXT, surface TEXT);
  CREATE TABLE dim_game(game_id INTEGER PRIMARY KEY, season INTEGER, week INTEGER, date_key INTEGER REFERENCES dim_date(date_key), game_date TEXT, kickoff_et TEXT, home_team_id INTEGER REFERENCES dim_team(team_id), away_team_id INTEGER REFERENCES dim_team(team_id), game_window TEXT, network TEXT, is_primetime INTEGER, surface TEXT, total_plays INTEGER, home_score INTEGER, away_score INTEGER);
  CREATE TABLE fact_odds(game_id INTEGER PRIMARY KEY REFERENCES dim_game(game_id), source TEXT, open_spread REAL, current_spread REAL, open_total REAL, current_total REAL, home_moneyline INTEGER, away_moneyline INTEGER, home_handle_pct INTEGER, updated_at TEXT);
  CREATE TABLE fact_ad_delivery(ad_id INTEGER PRIMARY KEY, game_id INTEGER REFERENCES dim_game(game_id), platform TEXT, ad_units INTEGER, impressions INTEGER, ad_spend REAL);
  CREATE TABLE fact_game_attendance(game_id INTEGER PRIMARY KEY REFERENCES dim_game(game_id), capacity INTEGER, tickets_distributed INTEGER, scanned_attendance INTEGER, avg_ticket_price REAL, secondary_avg_price REAL, ticket_revenue REAL);
  CREATE TABLE fact_viewership(view_id INTEGER PRIMARY KEY, game_id INTEGER REFERENCES dim_game(game_id), platform TEXT, avg_viewers_m REAL, minutes_viewed_m REAL);
  CREATE TABLE dim_fan(fan_id INTEGER PRIMARY KEY, home_team_id INTEGER REFERENCES dim_team(team_id), segment TEXT, age_band TEXT, state TEXT, contact_email TEXT, signup_date TEXT, marketing_opt_in INTEGER);
  CREATE TABLE fact_merch_orders(order_id INTEGER PRIMARY KEY, order_date TEXT, date_key INTEGER REFERENCES dim_date(date_key), fan_id INTEGER REFERENCES dim_fan(fan_id), team_id INTEGER REFERENCES dim_team(team_id), category TEXT, channel TEXT, quantity INTEGER, revenue REAL, cost REAL);
  CREATE TABLE fact_subscriptions(sub_id INTEGER PRIMARY KEY, fan_id INTEGER REFERENCES dim_fan(fan_id), plan TEXT, start_date TEXT, end_date TEXT, monthly_price REAL);
  CREATE TABLE fact_injuries(injury_id INTEGER PRIMARY KEY, game_id INTEGER REFERENCES dim_game(game_id), team_id INTEGER REFERENCES dim_team(team_id), body_part TEXT, severity TEXT, games_missed INTEGER);
  CREATE TABLE bi_dashboard_usage(week_start TEXT, dashboard TEXT, department TEXT, certified INTEGER, active_users INTEGER, views INTEGER);
  CREATE TABLE bi_query_log(week_start TEXT, user_type TEXT, query_count INTEGER);
  `);
  db.run("BEGIN");

  const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],DW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const sd=db.prepare("INSERT INTO dim_date VALUES (?,?,?,?,?,?,?)");
  for(let t=Date.UTC(2024,0,1);t<=Date.UTC(2026,11,31);t+=day){const d=new Date(t),m=d.getUTCMonth()+1;
    sd.run([dkey(iso(d)),iso(d),d.getUTCFullYear(),"Q"+Math.ceil(m/3),m,MN[m-1],DW[d.getUTCDay()]])}
  sd.free();

  // 32 fictional franchises
  const T=[
    ["Boston Minutemen","Boston","MA","AFC","AFC East","L"],["New York Knights","New York","NY","AFC","AFC East","L"],["Buffalo Blizzard","Buffalo","NY","AFC","AFC East","S"],["Miami Riptide","Miami","FL","AFC","AFC East","M"],
    ["Pittsburgh Ironmen","Pittsburgh","PA","AFC","AFC North","M"],["Cleveland Foundry","Cleveland","OH","AFC","AFC North","M"],["Cincinnati Rivermen","Cincinnati","OH","AFC","AFC North","S"],["Baltimore Harbormasters","Baltimore","MD","AFC","AFC North","M"],
    ["Houston Roughnecks","Houston","TX","AFC","AFC South","L"],["Nashville Sound","Nashville","TN","AFC","AFC South","M"],["Jacksonville Surge","Jacksonville","FL","AFC","AFC South","S"],["Indianapolis Racers","Indianapolis","IN","AFC","AFC South","S"],
    ["Denver Summit","Denver","CO","AFC","AFC West","M"],["Kansas City Plainsmen","Kansas City","MO","AFC","AFC West","S"],["Las Vegas High Rollers","Las Vegas","NV","AFC","AFC West","M"],["Los Angeles Comets","Los Angeles","CA","AFC","AFC West","L"],
    ["Dallas Wranglers","Dallas","TX","NFC","NFC East","L"],["Philadelphia Liberty","Philadelphia","PA","NFC","NFC East","L"],["Washington Sentinels","Washington","DC","NFC","NFC East","L"],["Brooklyn Ironbacks","New York","NY","NFC","NFC East","L"],
    ["Chicago Steel","Chicago","IL","NFC","NFC North","L"],["Green Bay Lumberjacks","Green Bay","WI","NFC","NFC North","S"],["Detroit Motormen","Detroit","MI","NFC","NFC North","M"],["Minneapolis Northmen","Minneapolis","MN","NFC","NFC North","M"],
    ["Atlanta Firebirds","Atlanta","GA","NFC","NFC South","M"],["New Orleans Krewe","New Orleans","LA","NFC","NFC South","S"],["Tampa Bay Tarpons","Tampa","FL","NFC","NFC South","M"],["Charlotte Lightning","Charlotte","NC","NFC","NFC South","S"],
    ["Seattle Evergreens","Seattle","WA","NFC","NFC West","M"],["San Francisco Fog","San Francisco","CA","NFC","NFC West","L"],["Phoenix Scorpions","Phoenix","AZ","NFC","NFC West","M"],["St. Louis Archers","St. Louis","MO","NFC","NFC West","S"]];
  const MS={L:"Large",M:"Medium",S:"Small"},MF={L:1.15,M:1,S:.9},PRICE={L:168,M:138,S:116};
  const teams=T.map((t,i)=>({id:i+1,name:t[0],city:t[1],state:t[2],conf:t[3],div:t[4],ms:t[5],cap:between(61,82)*1000,surface:r()<.5?"Grass":"Turf"}));
  teams.forEach(t=>db.run("INSERT INTO dim_team VALUES (?,?,?,?,?,?,?,?,?)",[t.id,t.name,t.city,t.state,t.conf,t.div,t.cap,MS[t.ms],t.surface]));

  // schedules: 2025 full season (18 wks); 2026 weeks 1–10 played, week 11 upcoming (as of Nov 17, 2026)
  const WINDOWS=["Thursday Night","Sunday Night","Monday Night",...Array(8).fill("Sunday Early"),...Array(5).fill("Sunday Late")];
  const OFF={"Thursday Night":0,"Sunday Night":3,"Monday Night":4,"Sunday Early":3,"Sunday Late":3};
  const KICK={"Thursday Night":"8:15 PM","Sunday Night":"8:20 PM","Monday Night":"8:15 PM","Sunday Early":"1:00 PM","Sunday Late":"4:25 PM"};
  const NET={"Thursday Night":"League+ (streaming)","Sunday Night":"Broadcast A","Monday Night":"Cable Sports + League+","Sunday Early":"Broadcast B / C (regional)","Sunday Late":"Broadcast B (national)"};
  const VBASE={"Thursday Night":13.5,"Sunday Night":21,"Monday Night":16,"Sunday Early":8.5,"Sunday Late":15};
  const CPM={Broadcast:[41,43],Cable:[36,37],Streaming:[50,54]};
  const norm=()=>(r()+r()+r()+r()-2)*1.732;
  const half=x=>Math.round(x*2)/2;
  const ml=p=>p>=.5?-Math.round(100*p/(1-p)):Math.round(100*(1-p)/p);
  teams.forEach(t=>{t.rating=(r()-.5)*14;t.off=20+r()*8});
  const sg=db.prepare("INSERT INTO dim_game VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"),sa=db.prepare("INSERT INTO fact_game_attendance VALUES (?,?,?,?,?,?,?)");
  const sv=db.prepare("INSERT INTO fact_viewership VALUES (?,?,?,?,?)"),si=db.prepare("INSERT INTO fact_injuries VALUES (?,?,?,?,?,?)");
  const so=db.prepare("INSERT INTO fact_odds VALUES (?,?,?,?,?,?,?,?,?,?)"),sd2=db.prepare("INSERT INTO fact_ad_delivery VALUES (?,?,?,?,?,?)");
  const nowTs=new Date().toISOString().replace("T"," ").slice(0,19);
  let gid=1,vid=1,iid=1,aid=1;const games=[];
  [[2025,Date.UTC(2025,8,4),18,18],[2026,Date.UTC(2026,8,10),11,10]].forEach(([season,wk1,weeks,played])=>{
    const g26=season===2026;
    for(let w=1;w<=weeks;w++){
      const done=w<=played;
      const order=teams.slice();for(let i=order.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
      for(let k=0;k<16;k++){
        const home=order[2*k],away=order[2*k+1],win=WINDOWS[k],prime=["Thursday Night","Sunday Night","Monday Night"].includes(win)?1:0;
        const date=iso(new Date(wk1+((w-1)*7+OFF[win])*day)),plays=done?between(122,152):null;
        // odds & result
        const exp=home.rating-away.rating+1.8,expT=home.off+away.off;
        const oSpread=half(-(exp+norm()*1.5)),cSpread=oSpread+half(norm()*.7),oTotal=half(expT+norm()*2),cTotal=oTotal+half(norm()*.8);
        const pH=1/(1+Math.exp(.155*cSpread));
        let hs=null,as=null;
        if(done){const m=exp+norm()*13,tp=Math.max(17,expT+norm()*10);hs=Math.max(0,Math.round((tp+m)/2));as=Math.max(0,Math.round((tp-m)/2));if(hs===as)hs+=3}
        sg.run([gid,season,w,dkey(date),date,KICK[win],home.id,away.id,win,NET[win],prime,home.surface,plays,hs,as]);
        so.run([gid,"Consensus",oSpread,cSpread,oTotal,cTotal,ml(Math.min(.97,pH+.02)),ml(Math.min(.97,1-pH+.02)),Math.round(Math.max(18,Math.min(82,50-cSpread*2.2+norm()*8))),done?date+" 23:59:00":nowTs]);
        if(done){
          const fill=Math.min(1.03,.93+r()*.08+(prime?.02:0)),dist=Math.round(home.cap*fill),scan=Math.round(dist*(.93+r()*.05));
          const price=Math.round(PRICE[home.ms]*(prime?1.15:1)*(g26?1.06:1)*(w>12?1.05:1)*(.92+r()*.16)*100)/100;
          sa.run([gid,home.cap,dist,scan,price,Math.round(price*(1.15+r()*.5+(prime?.25:0))*100)/100,Math.round(dist*price)]);
          const viewers=VBASE[win]*((MF[home.ms]+MF[away.ms])/2)*(g26?1.05:1)*(.85+r()*.3);
          const split=win==="Thursday Night"?{Streaming:1}:win==="Monday Night"?(g26?{Cable:.72,Streaming:.28}:{Cable:.8,Streaming:.2}):(g26?{Broadcast:.82,Streaming:.18}:{Broadcast:.88,Streaming:.12});
          Object.entries(split).forEach(([pf,sh])=>{const v=Math.round(viewers*sh*100)/100;sv.run([vid++,gid,pf,v,Math.round(v*170*(.9+r()*.2)*10)/10]);
            const units=between(28,34),imp=Math.round(v*1e6*units*(.92+r()*.16)),cpm=CPM[pf][g26?1:0]*(.9+r()*.2);
            sd2.run([aid++,gid,pf,units,imp,Math.round(imp/1000*cpm)])});
          [home,away].forEach(t=>{const n=poisson(1.05*(home.surface==="Turf"?1.18:1)*(g26?.88:1));
            for(let x=0;x<n;x++){const sev=wpick(["Minor","Moderate","Severe"],[60,30,10]);
              si.run([iid++,gid,t.id,pick(["Knee","Ankle","Hamstring","Shoulder","Concussion","Foot","Hip"]),sev,sev==="Minor"?between(0,1):sev==="Moderate"?between(1,4):between(4,12)])}});
        }
        games.push({gid,season,w,home,away});gid++;
      }
    }
  });
  // planted quality issues
  db.run("UPDATE fact_game_attendance SET scanned_attendance = capacity + 6200 WHERE game_id = 301");
  db.run("DELETE FROM fact_viewership WHERE game_id = 410");
  db.run("DELETE FROM fact_ad_delivery WHERE game_id = 410");
  // planted anomaly: partner ratings feed outage on 2026 Week 8 Thursday Night (streaming-only game 401) – ad server shows normal delivery
  db.run("UPDATE fact_viewership SET avg_viewers_m = ROUND(avg_viewers_m * 0.34, 2), minutes_viewed_m = ROUND(minutes_viewed_m * 0.34, 1) WHERE game_id = 401");
  db.run(`UPDATE fact_injuries SET team_id = (SELECT MIN(team_id) FROM dim_team WHERE team_id NOT IN
     (SELECT home_team_id FROM dim_game WHERE game_id = (SELECT game_id FROM fact_injuries WHERE injury_id = 7))
     AND team_id NOT IN (SELECT away_team_id FROM dim_game WHERE game_id = (SELECT game_id FROM fact_injuries WHERE injury_id = 7)))
   WHERE injury_id = 7`);
  sg.free();sa.free();sv.free();si.free();so.free();sd2.free();

  // fans
  const seg=["Season Ticket Holder","Casual","Streaming-first","Fantasy Player"],tw=teams.map(t=>({L:3,M:2,S:1}[t.ms]));
  const fans=[],sf=db.prepare("INSERT INTO dim_fan VALUES (?,?,?,?,?,?,?,?)");
  for(let i=1;i<=6000;i++){const t=wpick(teams,tw),s=wpick(seg,[12,38,30,20]);
    const st=r()<.8?t.state:pick(teams).state;
    const f={id:i,team:t,seg:s,oom:st!==t.state?1:0,aff:.15+r()*.85,email:`fan${(i*7919)%100000}.${t.city.toLowerCase().replace(/[^a-z]/g,"")}@example.com`};fans.push(f);
    sf.run([i,t.id,s,pick(["18-24","25-34","25-34","35-44","35-44","45-54","55+"]),st,f.email,iso(new Date(Date.UTC(2019,0,1)+Math.floor(r()*2860)*day)),r()<.62?1:0])}
  db.run("UPDATE dim_fan SET contact_email = (SELECT contact_email FROM dim_fan WHERE fan_id = 12) WHERE fan_id = 5999");
  db.run("UPDATE dim_fan SET contact_email = (SELECT contact_email FROM dim_fan WHERE fan_id = 45) WHERE fan_id = 6000");
  sf.free();

  // League+ streaming subscriptions
  const ss=db.prepare("INSERT INTO fact_subscriptions VALUES (?,?,?,?,?,?)");let sid=1;
  fans.forEach(f=>{
    if(r()>{"Streaming-first":.8,"Fantasy Player":.5,Casual:.35,"Season Ticket Holder":.3}[f.seg])return;
    const y=wpick([2024,2025,2026],[25,35,40]);
    let start=r()<.6?Date.UTC(y,7,15)+Math.floor(r()*46)*day:Date.UTC(y,0,1)+Math.floor(r()*365)*day;
    if(start>AS_OF)start=AS_OF-Math.floor(r()*60)*day;
    const prem0=r()<.35;
    const logit=-1.1+(prem0?-.8:.5)+({Casual:.7,"Streaming-first":-.5,"Season Ticket Holder":-.4,"Fantasy Player":-.1}[f.seg])+(f.oom?.8:0)-2.2*(f.aff-.55);
    let end=null;if(r()<1/(1+Math.exp(-logit))){const e=Date.UTC(new Date(start).getUTCFullYear()+1,1,5)+Math.floor(r()*50)*day;if(e<AS_OF)end=iso(new Date(e))}
    const prem=prem0;ss.run([sid++,f.id,prem?"Premium":"Basic",iso(new Date(start)),end,prem?14.99:6.99]);
  });
  ss.free();

  // merchandise
  const SEAS=[.9,1.1,.45,.7,.4,.35,.45,.9,1.4,1.2,1.25,1.6],CAT={Jersey:130,Headwear:35,Apparel:60,Collectibles:90};
  const sm=db.prepare("INSERT INTO fact_merch_orders VALUES (?,?,?,?,?,?,?,?,?,?)");let mid=500000;
  for(let mi=0;mi<23;mi++){const y=2025+Math.floor(mi/12),m=mi%12;
    const dim=new Date(Date.UTC(y,m+1,0)).getUTCDate(),last=(y===2026&&m===10)?16:dim;
    const n=Math.round(300*SEAS[m]*(y===2026?1.12:1)*last/dim);
    for(let k=0;k<n;k++){let f=pick(fans);while(r()>f.aff*1.3)f=pick(fans);const t=r()<.85?f.team:pick(teams),c=wpick(Object.keys(CAT),[35,25,28,12]),q=between(1,3);
      const rev=Math.round(q*CAT[c]*(.85+r()*.3)*100)/100,date=iso(new Date(Date.UTC(y,m,between(1,last))));
      sm.run([mid++,date,dkey(date),f.id,t.id,c,wpick(["Online","Stadium","Retail Partner"],[60,25,15]),q,rev,Math.round(rev*(.42+r()*.13)*100)/100])}}
  sm.run([mid++,"2026-11-08",20261108,null,21,"Jersey","Online",1,129.99,58]);
  sm.run([mid++,"2026-11-09",20261109,null,9,"Headwear","Online",2,69.98,31]);
  sm.free();

  // BI platform usage – weekly, 2026
  const dashes=[["League Executive Scorecard","Executive",1,24],["Ticketing & Attendance","Club Business",1,58],["Media & Viewership","Media",1,41],["Fan 360","Marketing",1,36],
    ["Merch & E-commerce","Consumer Products",1,29],["Club Business Benchmarks","Club Business",0,21],["Sponsorship ROI","Partnerships",0,15],["Legacy Ticketing Report (SSRS)","Club Business",0,26],["Concessions Aging","Stadium Ops",0,6]];
  const su=db.prepare("INSERT INTO bi_dashboard_usage VALUES (?,?,?,?,?,?)"),sq=db.prepare("INSERT INTO bi_query_log VALUES (?,?,?)");
  for(let w=0;w<45;w++){
    const ws=iso(new Date(Date.UTC(2026,0,5)+w*7*day)),inSeason=w>=35?1.25:w<6?1.15:1;
    dashes.forEach(([name,dept,cert,base])=>{
      let g=(1+w*.016)*inSeason;
      if(name.startsWith("Legacy"))g=Math.max(.04,1-w*.03);
      if(name==="Concessions Aging")g=w>20?.15:1;
      if(name==="Fan 360"&&w<10)g=.35;
      const u=Math.max(0,Math.round(base*g*(.9+r()*.2)));
      su.run([ws,name,dept,cert,u,Math.round(u*(2.5+r()*2))]);
    });
    const total=900+w*14,share=.24+Math.min(.34,w*.0085)+(r()-.5)*.03;
    sq.run([ws,"Business user",Math.round(total*share)]);sq.run([ws,"Analyst",Math.round(total*(1-share))]);
  }
  su.free();sq.free();
  // ---------- warehouse operations: SCD2 history, pipeline runs, cost ----------
  db.run(`CREATE TABLE dim_team_scd(team_key INTEGER PRIMARY KEY, team_id INTEGER REFERENCES dim_team(team_id), team TEXT, stadium_capacity INTEGER, surface TEXT, valid_from TEXT, valid_to TEXT, is_current INTEGER);
    CREATE TABLE etl_job_runs(run_id INTEGER PRIMARY KEY, job TEXT, layer TEXT, load_pattern TEXT, started_at TEXT, duration_s INTEGER, rows_processed INTEGER, status TEXT);
    CREATE TABLE warehouse_cost_daily(date TEXT PRIMARY KEY, compute_credits REAL, storage_tb REAL, queries INTEGER, avg_query_s REAL);`);
  const scd=db.prepare("INSERT INTO dim_team_scd VALUES (?,?,?,?,?,?,?,?)");let tk=1;
  const changed={3:["Grass","2026-03-01"],10:["Turf","2026-03-01"],18:[null,"2026-04-15"],27:["Grass","2026-05-01"],30:[null,"2026-02-20"]};
  teams.forEach(t=>{
    if(changed[t.id]){const [surf,when]=changed[t.id];
      const oldCap=surf?t.cap:t.cap-4000,oldSurf=surf?(t.surface==="Grass"?"Turf":"Grass"):t.surface;
      scd.run([tk++,t.id,t.name,oldCap,oldSurf,"2019-01-01",when,0]);
      scd.run([tk++,t.id,t.name,t.cap,t.surface,when,"9999-12-31",1]);
    }else scd.run([tk++,t.id,t.name,t.cap,t.surface,"2019-01-01","9999-12-31",1]);
  });
  scd.free();
  const JOBS=[["ingest_ticketing","Bronze","Incremental (hourly)",40,180000],["ingest_gate_scans","Bronze","Streaming (Kinesis)",30,900000],["ingest_ratings_feed","Bronze","Daily file",20,4000],
    ["ingest_odds_stream","Bronze","Streaming (Kinesis)",15,250000],["ingest_ecommerce","Bronze","CDC (Fivetran)",35,22000],["ingest_streaming_subs","Bronze","CDC (Fivetran)",25,9000],
    ["stg_tickets","Silver","Incremental merge",90,180000],["stg_scans","Silver","Incremental merge",120,900000],["stg_viewership","Silver","Full refresh",30,1800],["stg_odds","Silver","Stream validate + dedupe",4,250000],["stg_fans","Silver","Incremental merge",150,6000],
    ["fact_game_attendance","Gold","Incremental merge",45,160],["fact_viewership","Gold","Incremental merge",20,320],["fact_ad_delivery","Gold","Incremental merge",25,320],["fact_merch_orders","Gold","Incremental merge",60,900],
    ["fact_odds","Gold","Streaming upsert",5,16],["dim_fan (Fan 360)","Gold","SCD type 1 merge",200,6000],["dim_team_scd","Gold","SCD type 2",10,32],["dq_checks","Gold","Post-load tests",60,11],["semantic_refresh","Semantic","Metric cache refresh",40,14],["bi_extract_refresh","BI","Extract refresh",300,40]];
  const sj=db.prepare("INSERT INTO etl_job_runs VALUES (?,?,?,?,?,?,?,?)");let rid=1;
  for(let d=13;d>=0;d--){const date=new Date(AS_OF-d*day);
    JOBS.forEach(([job,layer,pat,dur,rows],k)=>{
      const ts=sec=>new Date(date.getTime()+(5*3600+k*240+sec)*1000).toISOString().replace("T"," ").slice(0,19);
      const D=Math.round(dur*(.8+r()*.5)),N=Math.round(rows*(.85+r()*.3));
      if(d===3&&job==="ingest_ratings_feed"){sj.run([rid++,job,layer,pat,ts(0),D,0,"Failed"]);sj.run([rid++,job,layer,pat,ts(2700),D,N,"Success (rerun)"]);return}
      if(d===0&&job==="bi_extract_refresh"){sj.run([rid++,job,layer,pat,ts(0),null,null,"Running"]);return}
      sj.run([rid++,job,layer,pat,ts(0),D,N,d===1&&job==="stg_scans"?"Success (retried)":"Success"]);
    });
  }
  sj.free();
  const sc=db.prepare("INSERT INTO warehouse_cost_daily VALUES (?,?,?,?,?)");
  for(let d=44;d>=0;d--){const dt=new Date(AS_OF-d*day),dow=dt.getUTCDay(),gameDay=dow===0||dow===1||dow===4;
    const opt=d<=15?.72:1; // clustering + aggregate tables shipped Nov 2
    sc.run([iso(dt),Math.round((gameDay?210:140)*opt*(.9+r()*.2)*10)/10,Math.round((18.2+(44-d)*.03)*100)/100,Math.round((gameDay?5200:3100)*(.9+r()*.2)),Math.round((gameDay?3.8:2.6)*(opt<1?.55:1)*(.9+r()*.2)*100)/100]);
  }
  sc.free();
  db.run("COMMIT");
  buildInternational(db,iso,day);
  buildIntlExtras(db,iso,day);
  buildReconciliation(db);
  return db;
}

// ---------- International Fan Journey (See / Know / Engage) ----------
// Runs after every table above is built and uses its OWN seeded generator, so the original sequence
// (and every existing table and on-screen number) is untouched. It only reads dim_team and dim_game.
function buildInternational(db,iso,day){
  let s=20270207;
  const r=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const rb=(a,b)=>a+r()*(b-a),R=Math.round,r1=x=>Math.round(x*10)/10,r2=x=>Math.round(x*100)/100;
  db.run(`
  CREATE TABLE dim_market(market_id INTEGER PRIMARY KEY, country TEXT, region TEXT, iso2 TEXT, timezone TEXT, population_m REAL, league_presence TEXT);
  CREATE TABLE bridge_game_market(game_id INTEGER PRIMARY KEY REFERENCES dim_game(game_id), market_id INTEGER REFERENCES dim_market(market_id), venue TEXT, city TEXT, venue_capacity INTEGER);
  CREATE TABLE fact_market_awareness(market_id INTEGER REFERENCES dim_market(market_id), week_start TEXT, team_id INTEGER REFERENCES dim_team(team_id), channel TEXT, reach INTEGER, impressions INTEGER, ad_spend REAL, video_views INTEGER, social_followers_gained INTEGER);
  CREATE TABLE fact_market_consideration(market_id INTEGER REFERENCES dim_market(market_id), week_start TEXT, team_id INTEGER REFERENCES dim_team(team_id), app_installs INTEGER, registered_fans INTEGER, email_opt_ins INTEGER, content_engagements INTEGER, streaming_trials INTEGER);
  CREATE TABLE fact_market_engagement(market_id INTEGER REFERENCES dim_market(market_id), week_start TEXT, team_id INTEGER REFERENCES dim_team(team_id), intl_game_tickets INTEGER, intl_game_attendance INTEGER, merch_orders INTEGER, merch_revenue REAL, paid_subscriptions INTEGER, repeat_engaged_fans INTEGER, engaged_fans INTEGER);
  CREATE TABLE fact_brand_survey(market_id INTEGER REFERENCES dim_market(market_id), quarter TEXT, team_id INTEGER REFERENCES dim_team(team_id), sample_n INTEGER, aided_awareness_pct REAL, unaided_awareness_pct REAL, favorability_pct REAL);
  `);
  db.run("BEGIN");
  // [id, country, region, iso2, timezone, population (M), presence, see→know factor, know→engage factor, paid CPM ($), merch AOV ($), weekly reach as share of population]
  const MK=[[1,"United Kingdom","Europe","GB","Europe/London",68.3,"Established",1.05,1.05,12,78],[2,"Germany","Europe","DE","Europe/Berlin",84.5,"Established",1.1,.78,11,74],
    [3,"Mexico","Latin America","MX","America/Mexico_City",129.7,"Established",.95,1,4.5,52],[4,"Canada","North America","CA","America/Toronto",40.1,"Established",1,1.1,10.5,70],
    [5,"Brazil","Latin America","BR","America/Sao_Paulo",216.4,"Growth",.7,1,3.4,46],[6,"Australia","Asia-Pacific","AU","Australia/Sydney",26.6,"Growth",1,.9,9.5,72],
    [7,"Ireland","Europe","IE","Europe/Dublin",5.3,"Emerging",1.15,.8,10,75],[8,"Spain","Europe","ES","Europe/Madrid",48.4,"Emerging",.9,.95,7,60]]
    .map(([id,country,region,iso2,tz,pop,pres,k1,k2,cpm,aov])=>({id,country,region,iso2,tz,pop,pres,k1,k2,cpm,aov}));
  const PEN={Established:.075,Growth:.045,Emerging:.022},GROW={Established:1.07,Growth:1.16,Emerging:1.28};
  const PF1={Established:1,Growth:.75,Emerging:.55},PF2={Established:1,Growth:.72,Emerging:.5};
  const AID0={Established:[58,64],Growth:[36,42],Emerging:[16,21]},AIDSTEP={Established:.5,Growth:.9,Emerging:1.2};
  MK.forEach(m=>db.run("INSERT INTO dim_market VALUES (?,?,?,?,?,?,?)",[m.id,m.country,m.region,m.iso2,m.tz,m.pop,m.pres]));

  const teams=db.exec("SELECT team_id, market_size FROM dim_team ORDER BY team_id")[0].values
    .map(([id,ms])=>({id,appeal:(ms==="Large"?1.25:ms==="Medium"?1:.85)*rb(.55,1.6)}));
  // clubs with international marketing rights in each market (more in established markets)
  const NR={Established:4,Growth:3,Emerging:2};
  MK.forEach(m=>{m.rights=new Set();while(m.rights.size<NR[m.pres])m.rights.add(teams[Math.floor(r()*teams.length)].id)});

  // international games: an existing Sunday Early game re-sited abroad (2025 London; 2026 London + Munich)
  const games=[[2025,6,1,"Thameside Park","London",86000],[2026,6,1,"Thameside Park","London",86000],[2026,9,2,"Nordpark Arena","Munich",72000]].map(([season,week,mk,venue,city,cap])=>{
    const g=db.exec(`SELECT game_id, home_team_id, away_team_id FROM dim_game WHERE season=${season} AND week=${week} AND game_window='Sunday Early' ORDER BY game_id LIMIT 1`)[0].values[0];
    db.run("INSERT INTO bridge_game_market VALUES (?,?,?,?,?)",[g[0],mk,venue,city,cap]);
    return {season,week,mk,cap,id:g[0],teams:[g[1],g[2]],fill:rb(.965,.995)}});

  // 13 weeks per season: 3 pre-season weeks + weeks 1–10, week_start = the Thursday that opens the game week
  const WK1={2025:Date.UTC(2025,8,4),2026:Date.UTC(2026,8,10)},weeks=[];
  [2025,2026].forEach(y=>{for(let w=-2;w<=10;w++)weeks.push({y,w,ws:iso(new Date(WK1[y]+(w-1)*7*day))})});
  // channel: [name, share of reach, frequency range, spend multiplier on paid CPM, video views per reached person]
  const CH=[["Social",.38,[4,6],.4,[1.6,2.8]],["Broadcast",.22,[2,3],0,[1,1]],["Streaming",.14,[3,4],0,[2,3.5]],["Paid digital",.26,[5,7],1,[.3,.6]]];
  const TW={6:.3,5:.15,4:.12,3:.12,2:.14,1:.17}; // ticket sales by weeks before an international game
  const sa=db.prepare("INSERT INTO fact_market_awareness VALUES (?,?,?,?,?,?,?,?,?)"),sk=db.prepare("INSERT INTO fact_market_consideration VALUES (?,?,?,?,?,?,?,?)");
  const se=db.prepare("INSERT INTO fact_market_engagement VALUES (?,?,?,?,?,?,?,?,?,?)");
  MK.forEach(m=>weeks.forEach(wk=>{
    const game=games.find(g=>g.mk===m.id&&g.season===wk.y),gw=game?game.week-wk.w:99; // gw: weeks until the game (0 = game week)
    const wts=teams.map(t=>t.appeal*(m.rights.has(t.id)?2.4:1)*(game&&game.teams.includes(t.id)?1.7:1)),wsum=wts.reduce((a,b)=>a+b,0);
    const others=teams.reduce((a,t,i)=>a+(game&&game.teams.includes(t.id)?0:wts[i]),0);
    const seas=(wk.w<=0?.62+.08*(wk.w+2):1+.012*wk.w)*(gw===0?2.1:gw>0&&gw<=3?1.2:gw<0&&gw>=-2?1.25:1);
    const y26=wk.y===2026,grow=y26?GROW[m.pres]:1;
    teams.forEach((t,ti)=>{
      const base=m.pop*1e6*PEN[m.pres]*(wts[ti]/wsum)*seas*grow*rb(.9,1.1);
      let reach=0,imps=0;
      CH.forEach(([ch,sh,fq,spk,vv])=>{
        const rc=R(base*sh*rb(.88,1.12)),im=R(rc*rb(fq[0],fq[1])),sp=spk?r2(im/1000*m.cpm*(y26?1.04:1)*spk*rb(.9,1.1)):0;
        const fol=ch==="Social"?R(rc*rb(.003,.006)*m.k1*PF1[m.pres]):0;
        sa.run([m.id,wk.ws,t.id,ch,rc,im,sp,R(rc*rb(vv[0],vv[1])),fol]);reach+=rc;imps+=im;
      });
      // Engage demand: game tickets and attendance for international games
      const playing=game&&game.teams.includes(t.id),share=playing?.2:.6*wts[ti]/others;
      let gtix=0,att=0;
      if(game&&TW[gw])gtix=R(game.cap*.8*TW[gw]*share*rb(.9,1.1));
      if(game&&gw===0)att=R(game.cap*game.fill*share);
      // Know: a share of the people reached create a league ID; game buyers and attendees need one (capped so the funnel never inverts)
      const reg0=R(reach*.0088*m.k1*PF1[m.pres]*(y26?1.07:1)*(gw>=0&&gw<=4?1.35:1)*rb(.85,1.15));
      // Engage: a share of registered fans buy, attend or subscribe
      const eng0=R(reg0*.24*m.k2*PF2[m.pres]*(y26?1.05:1)*(gw>=0&&gw<=5?1.2:1)*rb(.85,1.15));
      const orders=R(eng0*rb(.55,.7));
      const tix=Math.min(reach,gtix+R(eng0*rb(.02,.06))),attended=Math.min(reach,att);
      const engaged=Math.min(reach,Math.max(Math.min(reg0,eng0),tix,attended)),reg=Math.max(Math.min(reach,reg0),engaged);
      sk.run([m.id,wk.ws,t.id,Math.min(reach,R(reg*rb(1.35,1.75))),reg,Math.min(reg,R(reg*rb(.36,.54))),R(imps*rb(.018,.03)*(.75+.25*PF1[m.pres])),Math.min(reg,R(reg*rb(.08,.14)))]);
      se.run([m.id,wk.ws,t.id,tix,attended,Math.min(orders,engaged),r2(Math.min(orders,engaged)*m.aov*rb(.9,1.12)),Math.min(engaged,R(eng0*rb(.17,.25))),Math.min(engaged,R(eng0*rb(.26,.4)*(.7+.3*PF2[m.pres]))),engaged]);
    });
  }));
  sa.free();sk.free();se.free();

  // quarterly brand tracker: league-level rows (team_id NULL) plus one row per club
  const ss=db.prepare("INSERT INTO fact_brand_survey VALUES (?,?,?,?,?,?,?)"),QS=["2025-Q1","2025-Q2","2025-Q3","2025-Q4","2026-Q1","2026-Q2","2026-Q3","2026-Q4"];
  MK.forEach(m=>{const a0=rb(...AID0[m.pres]);QS.forEach((qt,qi)=>{
    const n=R(rb(1100,1600)*(m.pres==="Emerging"?.7:1)),lg=Math.min(92,a0+qi*AIDSTEP[m.pres]+rb(-1,1));
    ss.run([m.id,qt,null,n,r1(lg),r1(lg*rb(.32,.4)),r1(rb(52,64))]);
    teams.forEach(t=>{const a=lg*Math.min(.9,.2+.28*t.appeal*(m.rights.has(t.id)?1.6:1))*rb(.92,1.08);ss.run([m.id,qt,t.id,n,r1(a),r1(a*rb(.18,.32)),r1(rb(38,70))])});
  })});
  ss.free();
  db.run(`CREATE INDEX ix_maw ON fact_market_awareness(week_start, market_id, team_id);
    CREATE INDEX ix_mco ON fact_market_consideration(week_start, market_id, team_id);
    CREATE INDEX ix_men ON fact_market_engagement(week_start, market_id, team_id);`);
  db.run("COMMIT");
}

// ---------- International Fan Journey extras: out-of-home viewing, traditional media, home clubs ----------
// Runs after buildInternational with its OWN seeded generator, so every existing table and number stays the same.
// It only reads existing tables (fact_market_awareness, fact_market_consideration, bridge_game_market, dim_game).
function buildIntlExtras(db,iso,day){
  let s=20261201;
  const r=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const rb=(a,b)=>a+r()*(b-a),R=Math.round,r2=x=>Math.round(x*100)/100;
  db.run(`
  CREATE TABLE fact_market_ooh_viewing(market_id INTEGER REFERENCES dim_market(market_id), week_start TEXT, team_id INTEGER REFERENCES dim_team(team_id), partner_venues INTEGER, ooh_viewers INTEGER, watch_party_checkins INTEGER);
  CREATE TABLE fact_market_traditional_media(market_id INTEGER REFERENCES dim_market(market_id), week_start TEXT, team_id INTEGER REFERENCES dim_team(team_id), channel TEXT, placements INTEGER, est_impressions INTEGER, ad_spend REAL);
  CREATE TABLE dim_market_home_club(market_id INTEGER PRIMARY KEY REFERENCES dim_market(market_id), team_id INTEGER REFERENCES dim_team(team_id), hub_city TEXT, adopted_since INTEGER, fan_share_pct REAL);
  `);
  db.run("BEGIN");
  const mk=Object.fromEntries(db.exec("SELECT market_id, iso2, league_presence FROM dim_market")[0].values.map(([id,iso2,pres])=>[id,{iso2,pres}]));
  // Know: watching at a bar, pub, watch party or partner venue. Pub culture lifts out-of-home viewing in the UK, Ireland and Germany.
  const OOHK={GB:1.45,IE:1.6,DE:1.25,MX:1.15,CA:.9,BR:.85,AU:1.05,ES:.95};
  const so=db.prepare("INSERT INTO fact_market_ooh_viewing VALUES (?,?,?,?,?,?)");
  db.exec("SELECT market_id, week_start, team_id, SUM(reach) FROM fact_market_awareness WHERE channel IN ('Broadcast', 'Streaming') GROUP BY market_id, week_start, team_id ORDER BY market_id, week_start, team_id")[0].values
    .forEach(([m,ws,t,v])=>{const ooh=R(v*rb(.06,.1)*OOHK[mk[m].iso2]);so.run([m,ws,t,R(ooh/rb(55,90)),ooh,R(ooh*rb(.04,.08))])});
  so.free();
  // See: billboards and transit/print, heaviest in the weeks around an international game, split across clubs by their reach that week
  const games=db.exec("SELECT b.market_id, g.season, g.week FROM bridge_game_market b JOIN dim_game g ON g.game_id = b.game_id")[0].values;
  const WK1={2025:Date.UTC(2025,8,4),2026:Date.UTC(2026,8,10)};
  const gameWeek=games.map(([m,y,w])=>({m,y,ws:iso(new Date(WK1[y]+(w-1)*7*day))}));
  const BASE={Established:62000,Growth:26000,Emerging:12000};
  const reach={};db.exec("SELECT market_id, week_start, team_id, SUM(reach) FROM fact_market_awareness GROUP BY market_id, week_start, team_id")[0].values
    .forEach(([m,ws,t,v])=>{const k=m+"|"+ws;(reach[k]=reach[k]||[]).push([t,v])});
  const st=db.prepare("INSERT INTO fact_market_traditional_media VALUES (?,?,?,?,?,?,?)");
  Object.entries(reach).sort(([a],[b])=>a<b?-1:a>b?1:0).forEach(([k,list])=>{
    const [m,ws]=k.split("|"),y=+ws.slice(0,4),g=gameWeek.find(x=>x.m===+m&&x.y===y);
    const dw=g?(Date.parse(g.ws)-Date.parse(ws))/(7*day):99,boost=dw>=0&&dw<=3?3.2-dw*.5:1;
    const spend=BASE[mk[m].pres]*boost*(y===2026?1.1:1)*rb(.85,1.15),tot=list.reduce((a,x)=>a+x[1],0);
    list.sort((a,b)=>a[0]-b[0]).forEach(([t,v])=>{const sh=v/tot;if(sh<.04)return;
      [["Billboards",.65,[4,7],[2500,4200]],["Transit & print",.35,[6,9],[1200,2400]]].forEach(([ch,cs,cpm,unit])=>{
        const sp=r2(spend*sh*cs*rb(.9,1.1));st.run([+m,ws,t,ch,Math.max(1,R(sp/rb(...unit))),R(sp/rb(...cpm)*1000),sp])})});
  });
  st.free();
  // Home club: the club fans in each market have adopted as "their" team – the club with the most registered fans there
  const HUB={GB:["London",2007],IE:["Dublin",2019],DE:["Munich",2022],ES:["Madrid",2023],MX:["Mexico City",2016],CA:["Toronto",2008],BR:["São Paulo",2021],AU:["Melbourne",2020]};
  const sh=db.prepare("INSERT INTO dim_market_home_club VALUES (?,?,?,?,?)");
  db.exec(`SELECT market_id, team_id FROM (SELECT market_id, team_id, RANK() OVER (PARTITION BY market_id ORDER BY SUM(registered_fans) DESC, team_id) AS rk
    FROM fact_market_consideration GROUP BY market_id, team_id) WHERE rk = 1 ORDER BY market_id`)[0].values
    .forEach(([m,t])=>{const [city,since]=HUB[mk[m].iso2];sh.run([m,t,city,since+R(rb(0,2)),Math.round(rb(24,41)*10)/10])});
  sh.free();
  db.run(`CREATE INDEX ix_mooh ON fact_market_ooh_viewing(week_start, market_id, team_id);
    CREATE INDEX ix_mtrad ON fact_market_traditional_media(week_start, market_id, team_id);`);
  db.run("COMMIT");
}

// ---------- Survey ↔ activation reconciliation ----------
// Runs last with its OWN seeded generator and reads nothing, so no existing table or number moves.
// fact_fan_activation is "the first golden truth": every fan activation (surveys, game events, ticket events).
// fact_fan_survey is the survey platform's export. Fan PII is governed, so both carry only a hashed email.
// The survey export misses a known mix of rows in activation: hash normalization, event-name mapping,
// a UTC partition cutoff, null and duplicate hashes, plus a small unexplained residual.
function buildReconciliation(db){
  let s=20261115;
  const r=()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const pick=a=>a[Math.floor(r()*a.length)],wpick=(items,w)=>{let x=r()*w.reduce((a,b)=>a+b,0);for(let i=0;i<items.length;i++){x-=w[i];if(x<=0)return items[i]}return items[items.length-1]};
  const hex=()=>{let h="";for(let i=0;i<8;i++)h+=(Math.floor(r()*4294967296)>>>0).toString(16).padStart(8,"0");return h}; // synthetic SHA-256-style digest – no email exists anywhere
  const pad=n=>String(n).padStart(2,"0"),H=36e5,MIN=6e4;
  const utc=t=>{const d=new Date(t);return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`};
  const local=(t,off)=>utc(t+off*H)+(off<0?"-":"+")+pad(Math.abs(off))+":00"; // ISO local time with offset, as the survey vendor sends it
  db.run(`
  CREATE TABLE fact_fan_activation(activation_id INTEGER PRIMARY KEY, hashed_email TEXT, event_type TEXT, event_name TEXT, event_ts TEXT, source TEXT);
  CREATE TABLE fact_fan_survey(response_id INTEGER PRIMARY KEY, hashed_email TEXT, survey_id TEXT, event_name TEXT, submitted_ts TEXT, market TEXT);
  CREATE TABLE gov_hash_crosswalk(source_hash TEXT PRIMARY KEY, normalized_hash TEXT, method TEXT);
  `);
  db.run("BEGIN");
  // market: [iso2, weight, UTC offset in November]
  const MK=[["GB",22,0],["MX",18,-6],["CA",15,-5],["DE",14,1],["BR",10,-3],["AU",9,11],["IE",6,0],["ES",6,1]];
  const fans=[],byMk={};
  for(let i=0;i<3400;i++){const m=wpick(MK,MK.map(x=>x[1])),f={mk:m[0],off:m[2],hash:hex(),raw:null};
    if(r()<.25)f.raw=hex(); // typed with a capital letter or a trailing space: hashing the raw string gives a different digest
    fans.push(f);(byMk[f.mk]=byMk[f.mk]||[]).push(f)}
  const ALL=MK.map(m=>m[0]);
  // [survey_id, event_name, local start, local end (inclusive), markets, responses, flags]
  // vendorB = in-venue QR survey whose vendor hashes the email as typed; vendorCode = activation still logs the vendor's raw event code
  const SV=[["SV-NPS-26Q3","Fan NPS · 2026 Q3","2026-07-01","2026-09-30",ALL,900,{}],
    ["SV-NPS-26Q4","Fan NPS · 2026 Q4","2026-10-01","2026-11-15",ALL,1150,{}],
    ["SV-FAV-26","Favorite Club Survey 2026","2026-09-01","2026-11-15",ALL,700,{}],
    ["SV-WELCOME","New Fan Welcome Survey","2026-09-01","2026-11-15",ALL,600,{}],
    ["SV-LON-26","London Game Experience 2026","2026-10-18","2026-10-25",["GB","IE","DE","ES"],320,{vendorB:1}],
    ["SV-MUC-26","Munich Game Experience 2026","2026-11-08","2026-11-15",["DE","ES","GB"],230,{vendorB:1}],
    ["SV-WATCH-26","Watch Party Pulse 2026","2026-10-15","2026-11-15",ALL,85,{vendorCode:"SRV_WATCHPARTY_PULSE_26"}]];
  const CUTOFF=Date.UTC(2026,10,16); // activation is loaded through the 2026-11-15 UTC partition (nightly D-1 load)
  const svRows=[],acRows=[],xwalk=new Map();
  const respond=(sv,f,t)=>{ // t = submission time (UTC ms)
    const [id,name,,,,,fl]=sv;let hash=f.hash;
    if(fl.vendorB&&f.raw){hash=f.raw;xwalk.set(f.raw,f.hash)}
    const q=r();let act=true;
    if(q<.006){hash=r()<.5?null:"";act=false}      // anonymous / dropped email: no hashed ID at all
    else if(q<.010)act=false;                       // webhook to activation failed: genuinely missing
    if(t>=CUTOFF)act=false;                         // lands in the 2026-11-16 UTC partition, not loaded yet
    svRows.push([hash,id,name,t,f]);
    if(hash!=null&&hash!==""&&r()<.008)svRows.push([hash,id,name,t+(1+Math.floor(r()*6))*MIN,f]); // double submit; activation dedupes
    if(act)acRows.push([f.hash,"Survey",fl.vendorCode||name,t,"Survey platform"]);
  };
  const HR=[1,1,1,1,1,1,2,3,4,5,6,6,7,7,6,6,7,8,10,11,11,9,6,3]; // local hour weights, evening-heavy
  SV.forEach(sv=>{const [,, a,b,mks,n]=sv,d0=Date.parse(a+"T00:00:00Z"),days=Math.round((Date.parse(b+"T00:00:00Z")-d0)/864e5)+1;
    for(let k=0;k<n;k++){const f=pick(byMk[wpick(mks,mks.map(m=>MK.find(x=>x[0]===m)[1]))]),h=wpick(HR.map((_,i)=>i),HR);
      const lt=d0+Math.floor(r()*days)*864e5+h*H+Math.floor(r()*3600)*1000;respond(sv,f,lt-f.off*H)}});
  // Week 10 game-day pulse: NPS push on Sunday 2026-11-15, 5–11 PM local. Evening responses in the Americas cross UTC midnight.
  for(let k=0;k<280;k++){const f=pick(fans),lt=Date.UTC(2026,10,15,17)+Math.floor(r()*6*3600)*1000;respond(SV[1],f,lt-f.off*H)}
  // other activations: game events and ticket events
  const OTHER=[["Game event","Watch party check-in","Venue partner",30],["Game event","Game-day app check-in","Fan app",34],["Game event","International game attendance","Ticketing",8],
    ["Ticket event","Ticket purchase","Ticketing",18],["Ticket event","Ticket transfer","Ticketing",6],["Game event","League+ International stream start","Streaming",24]];
  const A0=Date.UTC(2026,6,1);
  fans.forEach(f=>{const n=Math.floor(r()*5);for(let k=0;k<n;k++){const o=wpick(OTHER,OTHER.map(x=>x[3])),t=A0+Math.floor(r()*(CUTOFF-A0));
    acRows.push([f.hash,o[0],o[1],t,o[2]]);if(r()<.015)acRows.push([f.hash,o[0],o[1],t,o[2]])}}); // retried load double-writes the row
  svRows.sort((a,b)=>a[3]-b[3]);acRows.sort((a,b)=>a[3]-b[3]);
  const ss=db.prepare("INSERT INTO fact_fan_survey VALUES (?,?,?,?,?,?)");
  svRows.forEach(([hash,id,name,t,f],i)=>ss.run([i+1,hash,id,name,local(t,f.off),f.mk]));ss.free();
  const sa=db.prepare("INSERT INTO fact_fan_activation VALUES (?,?,?,?,?,?)");
  acRows.forEach(([hash,ty,name,t,src],i)=>sa.run([i+1,hash,ty,name,utc(t),src]));sa.free();
  const sx=db.prepare("INSERT INTO gov_hash_crosswalk VALUES (?,?,?)");
  [...xwalk].sort(([a],[b])=>a<b?-1:1).forEach(([raw,norm])=>sx.run([raw,norm,"SHA-256(lower(trim(email))) re-derived inside the PII vault"]));sx.free();
  db.run(`CREATE INDEX ix_act ON fact_fan_activation(hashed_email, event_name);
    CREATE INDEX ix_srv ON fact_fan_survey(hashed_email, event_name);`);
  db.run("COMMIT");
}
