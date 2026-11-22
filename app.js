(() => {
let db=null, cm=null, lastRes=null, resChart=null;
const charts={};
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const PAL=()=>["--c1","--c2","--c3","--c4","--c5","--c6"].map(css);
const money=n=>n==null?"–":"$"+(Math.abs(n)>=1e9?(n/1e9).toFixed(2)+"B":Math.abs(n)>=1e6?(n/1e6).toFixed(2)+"M":Math.abs(n)>=1e4?(n/1e3).toFixed(0)+"K":Math.round(n).toLocaleString());
const moneyFull=n=>n==null?"–":"$"+Math.round(n).toLocaleString();
const FMT={bn:n=>n==null?"–":(n/1e9).toFixed(1)+"B",money2:n=>n==null?"–":"$"+n.toFixed(2),m:n=>n==null?"–":n.toFixed(1)+"M",money,pct:n=>n==null?"–":n.toFixed(1)+"%",int:n=>n==null?"–":Math.round(n).toLocaleString(),dec:n=>n==null?"–":n.toFixed(2)};

function q(sql){const r=db.exec(sql);return r.length?r[r.length-1]:{columns:[],values:[]}}
function one(sql){const r=q(sql);return r.values.length?r.values[0][0]:null}
function rows(sql){const r=q(sql);return r.values.map(v=>Object.fromEntries(r.columns.map((c,i)=>[c,v[i]])))}
function table(cols,data,numCols=[]){
  return `<table><thead><tr>${cols.map((c,i)=>`<th class="${numCols.includes(i)?"num":""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${
    data.map(r=>`<tr>${r.map((v,i)=>`<td class="${numCols.includes(i)?"num":""}">${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function mkChart(id,cfg){if(charts[id])charts[id].destroy();charts[id]=new Chart(document.getElementById(id),cfg);return charts[id]}
Chart.defaults.font.family="Inter, system-ui, sans-serif";Chart.defaults.color="#5d6b7a";Chart.defaults.plugins.legend.labels.boxWidth=12;
function modal(html){$("#modalBody").innerHTML=html;$("#modal").hidden=false}
$("#modalClose").onclick=()=>$("#modal").hidden=true;
$("#modal").onclick=e=>{if(e.target.id==="modal")$("#modal").hidden=true};

/* ---------- navigation & notes ---------- */
let current="overview";const rendered={};
/* URL slugs: every tab has a shareable #hash (and /international is a friendly path rewritten to the app) */
const SLUG={overview:"overview",brief:"brief",kpi:"kpi",ask:"ask",odds:"odds",erd:"erd",wh:"warehouse",sql:"sql",churn:"churn",fan:"fan-360",intl:"international",roadmap:"roadmap",gov:"governance",recon:"reconciliation",adopt:"adoption",plan:"90-days"};
const TAB_OF=Object.fromEntries(Object.entries(SLUG).map(([t,s])=>[s,t]));
const FRIENDLY_PATH=/\/international\/?$/;
function tabFromUrl(){
  const raw=location.hash.slice(1);
  let h;
  try{h=decodeURIComponent(raw)}catch{h=raw}
  h=h.toLowerCase();
  if(TAB_OF[h])return TAB_OF[h];
  if(SLUG[h])return h;
  if(!h&&FRIENDLY_PATH.test(location.pathname))return "intl";
  return "overview";
}
const tabName=t=>{const b=$(`#nav [data-tab="${t}"]`);return b?b.textContent.replace("★","").replace("✦","").trim():""};
function show(tab,hist="push"){
  if(!RENDER[tab])tab="overview";
  current=tab;
  document.querySelectorAll("#nav button").forEach(b=>{const on=b.dataset.tab===tab;b.classList.toggle("on",on);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  document.querySelectorAll(".tab").forEach(s=>s.classList.toggle("on",s.id==="tab-"+tab));
  $("#mbarTab").textContent=tabName(tab);
  if(hist!=="none"){
    const url=location.pathname.replace(FRIENDLY_PATH,"/")+location.search+"#"+SLUG[tab];
    if(location.hash!=="#"+SLUG[tab]||FRIENDLY_PATH.test(location.pathname))history[hist==="replace"?"replaceState":"pushState"](null,"",url);
  }
  if(db&&!rendered[tab]){rendered[tab]=true;RENDER[tab]()}
  if(tab==="sql"&&cm)setTimeout(()=>cm.refresh(),0);
  window.scrollTo(0,0);
}
/* mobile menu (≤900px): sticky top bar + dropdown drawer */
function setMenu(open){$("#side").classList.toggle("open",open);const b=$("#menuBtn");b.setAttribute("aria-expanded",String(open));b.setAttribute("aria-label",open?"Close sections menu":"Open sections menu")}
const menuOpen=()=>$("#side").classList.contains("open");
$("#menuBtn").onclick=()=>setMenu(!menuOpen());
document.addEventListener("click",e=>{if(menuOpen()&&!$("#side").contains(e.target))setMenu(false)});
$("#nav").onclick=e=>{const b=e.target.closest("button");if(b){setMenu(false);show(b.dataset.tab)}};
$("#tourBtn").addEventListener("click",()=>setMenu(false));
window.addEventListener("popstate",()=>{setMenu(false);show(tabFromUrl(),"none")});
window.addEventListener("hashchange",()=>{const t=tabFromUrl();if(t!==current||location.hash!=="#"+SLUG[t])show(t,"replace")});
document.addEventListener("keydown",e=>{if(e.key!=="Escape")return;if(menuOpen()){e.stopImmediatePropagation();setMenu(false);$("#menuBtn").focus();return}$("#modal").hidden=true});

/* ---------- flow diagrams (architecture, lineage) ---------- */
function flow(spec,compact,colors){
  const W=1110,cw=W/spec.cols.length,bw=Math.min(160,cw-24),bh=compact?40:46,gap=compact?54:62;
  const maxN=Math.max(...spec.cols.map(c=>c.n.length)),H=50+maxN*gap+10,pos={};
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Data flow diagram"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" fill="#9aa8b8"/></marker></defs>`;
  spec.cols.forEach((c,ci)=>{
    const x=ci*cw+(cw-bw)/2,top=50+(maxN-c.n.length)*gap/2;
    s+=`<text x="${ci*cw+cw/2}" y="22" text-anchor="middle" font-size="11" font-weight="700" fill="#5d6b7a" letter-spacing=".06em">${esc(c.t.toUpperCase())}</text>`;
    c.n.forEach(([id,l,sub,info],ni)=>{const y=top+ni*gap;pos[id]={x,y};
      if(info)s+=`<g class="flow-click" data-info="${info}" tabindex="0" role="button" aria-label="${esc(l)}">`;
      s+=`<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${colors&&colors[id]?colors[id]:ci===spec.cols.length-1?"#e6edfc":"#fff"}" stroke="#c7d0db"/>`+
        `<text x="${x+bw/2}" y="${y+(sub?18:bh/2+4)}" text-anchor="middle" font-size="12" font-weight="600" fill="#162231">${esc(l)}</text>`+
        (sub?`<text x="${x+bw/2}" y="${y+34}" text-anchor="middle" font-size="10.5" fill="#5d6b7a">${esc(sub)}</text>`:"")+(info?"</g>":"")});
  });
  spec.edges.forEach(([a,b])=>{const A=pos[a],B=pos[b],x1=A.x+bw,y1=A.y+bh/2,x2=B.x-2,y2=B.y+bh/2,dx=(x2-x1)/2;
    const skip=(x2-x1)>cw*0.6&&Math.abs(y1-y2)<6,dip=bh+18;
    s+=skip?`<path d="M${x1},${y1} C${x1+40},${y1+dip} ${x2-40},${y2+dip} ${x2},${y2}" fill="none" stroke="#9aa8b8" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#ar)"/>`
      :`<path d="M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}" fill="none" stroke="#9aa8b8" stroke-width="1.5" marker-end="url(#ar)"/>`});
  let band=esc(spec.band);
  (spec.bandLinks||[]).forEach(([txt,key])=>{band=band.replace(esc(txt),`<a data-info="${key}" tabindex="0">${esc(txt)}</a>`)});
  return s+`</svg><div class="band">${band}</div>`;
}
function awsInfo(key){const i=AWS_INFO[key];if(!i)return;
  modal(`<h3>${esc(i.t)}</h3><dl class="kv"><dt>Role here</dt><dd>${esc(i.role)}</dd><dt>Why this choice</dt><dd>${esc(i.why)}</dd><dt>Cost &amp; scale</dt><dd>${esc(i.cost)}</dd></dl>`)}
document.addEventListener("click",e=>{const n=e.target.closest("[data-info]");if(n)awsInfo(n.dataset.info)});
document.addEventListener("keydown",e=>{if(e.key==="Enter"){const n=e.target.closest&&e.target.closest("[data-info]");if(n)awsInfo(n.dataset.info)}});

/* ---------- overview ---------- */
function renderOverview(){
  const dq=DQ.map(d=>one(d[3])),pass=dq.filter(v=>v===0).length;
  const wau=one("SELECT SUM(active_users) FROM bi_dashboard_usage WHERE week_start=(SELECT MAX(week_start) FROM bi_dashboard_usage)");
  const self=one("SELECT ROUND(100.0*SUM(CASE WHEN user_type='Business user' THEN query_count END)/SUM(query_count),0) FROM bi_query_log WHERE week_start=(SELECT MAX(week_start) FROM bi_query_log)");
  $("#ovStats").innerHTML=[["Certified KPIs",KPIS.length,"owner + definition + SQL"],["Gold tables",Object.keys(ERD.tables).length,"star schema, cataloged"],
    ["Quality checks passing",`${pass}/${DQ.length}`,"run live on load"],["Weekly active BI users",wau,`${self}% of queries are self-service`]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  $("#ovArch").innerHTML=flow(ARCH,true);
}

/* ---------- KPI scorecard ---------- */
const VIEW={exec:{deny:[]},club:{team:21,deny:["inj"],note:"Row-level security on: Chicago Steel staff see their own home games, fans and merch – plus league benchmarks in shared dashboards. Health data is not available to clubs."},media:{deny:["tix","merch","subs","inj"],note:"Media partner view: audience, ad and CPM data only. Ticketing, merch, subscriber and health data are hidden by policy."}};
function filters(){const v=VIEW[$("#fView").value||"exec"];return {...PERIODS[$("#fPeriod").value],conf:$("#fRegion").value,div:$("#fSegment").value,team:v.team,deny:v.deny}}
function fillDivisions(){
  const c=$("#fRegion").value,cur=$("#fSegment").value;
  const divs=rows(`SELECT DISTINCT division FROM dim_team ${c?`WHERE conference='${c}'`:""} ORDER BY division`).map(r=>r.division);
  $("#fSegment").innerHTML=`<option value="">All divisions</option>`+divs.map(d=>`<option ${d===cur?"selected":""}>${esc(d)}</option>`).join("");
}
function renderKpi(){
  if(!$("#fPeriod").options.length)$("#fPeriod").innerHTML=Object.entries(PERIODS).map(([k,p])=>`<option value="${k}">${esc(p.label)}</option>`).join("");
  if($("#fSegment").options.length<=1)fillDivisions();
  const f=filters(),P=PAL(),vw=VIEW[$("#fView").value||"exec"];
  $("#rlsNote").hidden=!vw.note;$("#rlsNote").textContent=vw.note||"";
  $("#kpis").innerHTML=KPIS.map(k=>{
    if(f.deny.includes(k.id))return `<div class="kpi locked"><div class="lbl"><span>${esc(k.label)}</span></div><div class="val">🔒 No access for this role</div><span class="badge b-bad">Restricted by policy</span></div>`;
    const v=one(k.sql(f)),p=f.prior?one(k.sql({...f,...f.prior})):null;
    let d="";if(p!=null&&v!=null&&p!==0){
      const ch=k.fmt==="pct"?v-p:100*(v-p)/Math.abs(p),good=k.inverse?ch<0:ch>0;
      d=`<span class="delta ${good?"up":"down"}">${ch>0?"▲":"▼"} ${Math.abs(ch).toFixed(1)}${k.fmt==="pct"?" pts":"%"} vs 2025</span>`;
    }else d=`<span class="delta muted">full season view</span>`;
    return `<div class="kpi"><div class="lbl"><span>${esc(k.label)}</span><button class="info" data-kpi="${k.id}" aria-label="About ${esc(k.label)}">ⓘ</button></div>
      <div class="val">${FMT[k.fmt](v)}</div>${d}<div><span class="badge b-cert">Certified</span>${k.restricted?` <span class="badge b-bad">Restricted</span>`:""}</div></div>`}).join("");

  const homeJoin="JOIN dim_game g ON g.game_id=a.game_id JOIN dim_team t ON t.team_id=g.home_team_id";
  const wk=ff=>rows(`WITH gv AS (SELECT game_id, SUM(avg_viewers_m) v FROM fact_viewership GROUP BY game_id)
    SELECT g.week w, AVG(gv.v) v, 100.0*SUM(a.scanned_attendance)/SUM(a.capacity) att
    FROM fact_game_attendance a ${homeJoin} LEFT JOIN gv ON gv.game_id=g.game_id WHERE ${gameWhere(ff)} GROUP BY g.week ORDER BY g.week`);
  const tr=wk(f),pr=f.prior?wk({...f,...f.prior}):[];
  const ds=[{type:"bar",label:`Avg viewers ${f.season} (M)`,data:tr.map(r=>r.v),backgroundColor:P[0],borderRadius:4,yAxisID:"y",order:2}];
  if(pr.length)ds.push({type:"line",label:`Avg viewers ${f.prior.season} (M)`,data:pr.map(r=>r.v),borderColor:"#9aa8b8",borderDash:[5,4],pointRadius:0,tension:.3,yAxisID:"y",order:1});
  ds.push({type:"line",label:"Attendance %",data:tr.map(r=>r.att),borderColor:P[2],backgroundColor:P[2],tension:.3,yAxisID:"y1",order:0});
  mkChart("cTrend",{data:{labels:tr.map(r=>"Wk "+r.w),datasets:ds},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{y:{title:{display:true,text:"Viewers (M)"}},y1:{position:"right",grid:{display:false},suggestedMin:85,suggestedMax:100,ticks:{callback:v=>v.toFixed(0)+"%"}}},
      plugins:{tooltip:{callbacks:{label:c=>c.dataset.yAxisID==="y1"?` Attendance ${c.raw.toFixed(1)}%`:` ${c.dataset.label}: ${c.raw.toFixed(2)}M`}}}}});

  const dv=rows(`SELECT t.division d, SUM(a.ticket_revenue) rev FROM fact_game_attendance a ${homeJoin} WHERE ${gameWhere(f,{div:false})} GROUP BY 1 ORDER BY rev DESC`);
  mkChart("cRegion",{type:"bar",data:{labels:dv.map(r=>r.d),datasets:[{label:"Ticket revenue",data:dv.map(r=>r.rev),borderRadius:4,
    backgroundColor:dv.map(r=>!f.div||r.d===f.div?P[1]:"#c9d6e3")}]},
    options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>" "+moneyFull(c.raw)}}},scales:{x:{ticks:{callback:v=>money(v)}}},
      onClick:(e,els)=>{if(!els.length)return;const d=dv[els[0].index].d;$("#fSegment").value=$("#fSegment").value===d?"":d;renderKpi()},
      onHover:(e,els)=>{e.native.target.style.cursor=els.length?"pointer":"default"}}});

  const pl=rows(`SELECT v.platform p, SUM(v.avg_viewers_m) s FROM fact_viewership v JOIN dim_game g ON g.game_id=v.game_id JOIN dim_team t ON t.team_id=g.home_team_id WHERE ${gameWhere(f)} GROUP BY 1 ORDER BY s DESC`);
  const tot=pl.reduce((a,r)=>a+r.s,0);
  mkChart("cSeg",{type:"doughnut",data:{labels:pl.map(r=>r.p),datasets:[{data:pl.map(r=>r.s),backgroundColor:[P[0],P[1],P[2]],borderWidth:2}]},
    options:{maintainAspectRatio:false,cutout:"62%",plugins:{legend:{position:"bottom"},tooltip:{callbacks:{label:c=>` ${c.label}: ${(100*c.raw/tot).toFixed(1)}% of audience`}}}}});

  const tw=teamWhere(f).map(w=>" AND "+w).join("");
  const top=q(`SELECT t.team, t.division, SUM(m.revenue) FROM fact_merch_orders m JOIN dim_team t ON t.team_id=m.team_id WHERE m.order_date BETWEEN '${f.start}' AND '${f.end}'${tw} GROUP BY t.team_id ORDER BY 3 DESC LIMIT 8`);
  $("#tTop").innerHTML=f.deny.includes("merch")?'<p class="muted">🔒 Merchandise data is not shared with this role.</p>':table(["Club","Division","Revenue"],top.values.map(v=>[esc(v[0]),esc(v[1]),money(v[2])]),[2]);
  const win=q(`WITH pg AS (SELECT g.game_id, g.game_window gw, SUM(v.avg_viewers_m) tot, SUM(CASE WHEN v.platform='Streaming' THEN v.avg_viewers_m ELSE 0 END) st
    FROM fact_viewership v JOIN dim_game g ON g.game_id=v.game_id JOIN dim_team t ON t.team_id=g.home_team_id WHERE ${gameWhere(f)} GROUP BY g.game_id)
    SELECT gw, COUNT(*), AVG(tot), 100.0*SUM(st)/SUM(tot) FROM pg GROUP BY gw ORDER BY 3 DESC`);
  $("#tReps").innerHTML=table(["Window","Games","Avg viewers","Streaming"],win.values.map(v=>[esc(v[0]),v[1],v[2].toFixed(1)+"M",v[3].toFixed(0)+"%"]),[1,2,3]);

  const adJoin="FROM fact_ad_delivery d JOIN dim_game g ON g.game_id=d.game_id JOIN dim_team t ON t.team_id=g.home_team_id";
  const aw=rows(`SELECT g.week w,
      SUM(CASE WHEN d.platform='Streaming' THEN d.impressions ELSE 0 END)/1e9 si, SUM(CASE WHEN d.platform<>'Streaming' THEN d.impressions ELSE 0 END)/1e9 ni,
      1000.0*SUM(CASE WHEN d.platform='Streaming' THEN d.ad_spend END)/SUM(CASE WHEN d.platform='Streaming' THEN d.impressions END) sc,
      1000.0*SUM(CASE WHEN d.platform<>'Streaming' THEN d.ad_spend END)/SUM(CASE WHEN d.platform<>'Streaming' THEN d.impressions END) nc
      ${adJoin} WHERE ${gameWhere(f)} GROUP BY g.week ORDER BY g.week`);
  mkChart("cAds",{data:{labels:aw.map(r=>"Wk "+r.w),datasets:[
    {type:"bar",label:"Network TV impressions (B)",data:aw.map(r=>r.ni),backgroundColor:P[0],stack:"i",yAxisID:"y",order:2},
    {type:"bar",label:"Streaming impressions (B)",data:aw.map(r=>r.si),backgroundColor:P[3],stack:"i",yAxisID:"y",order:2},
    {type:"line",label:"Network CPM",data:aw.map(r=>r.nc),borderColor:P[2],backgroundColor:P[2],tension:.3,yAxisID:"y1",order:0},
    {type:"line",label:"Streaming CPM",data:aw.map(r=>r.sc),borderColor:P[4],backgroundColor:P[4],tension:.3,yAxisID:"y1",order:0}]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{y:{stacked:true,title:{display:true,text:"Impressions (B)"}},y1:{position:"right",grid:{display:false},ticks:{callback:v=>"$"+v.toFixed(0)},title:{display:true,text:"CPM"}}},
      plugins:{tooltip:{callbacks:{label:c=>c.dataset.yAxisID==="y1"?` ${c.dataset.label}: $${c.raw.toFixed(2)}`:` ${c.dataset.label.replace(" (B)","")}: ${c.raw.toFixed(2)}B`}}}}});
  const sh=rows(`SELECT CASE WHEN d.platform='Streaming' THEN 'Streaming' ELSE 'Network TV' END ch, SUM(d.impressions) imp, SUM(d.ad_spend) sp ${adJoin} WHERE ${gameWhere(f)} GROUP BY ch ORDER BY ch`);
  const ti=sh.reduce((a,r)=>a+r.imp,0),ts=sh.reduce((a,r)=>a+r.sp,0);whatIf(sh);
  $("#tAds").innerHTML=table(["Channel","Impressions","% of imps","Ad spend","% of spend","CPM"],sh.map(r=>[`<b>${r.ch}</b>`,(r.imp/1e9).toFixed(1)+"B",(100*r.imp/ti).toFixed(1)+"%",money(r.sp),(100*r.sp/ts).toFixed(1)+"%","$"+(1000*r.sp/r.imp).toFixed(2)]),[1,2,3,4,5]);
  mkChart("cAdShare",{type:"bar",data:{labels:sh.map(r=>r.ch),datasets:[{label:"% of impressions",data:sh.map(r=>100*r.imp/ti),backgroundColor:P[0],borderRadius:4},{label:"% of ad spend",data:sh.map(r=>100*r.sp/ts),backgroundColor:P[2],borderRadius:4}]},
    options:{indexAxis:"y",maintainAspectRatio:false,scales:{x:{max:100,ticks:{callback:v=>v+"%"}}},plugins:{tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.raw.toFixed(1)}%`}}}}});
}
$("#fRegion").addEventListener("change",()=>{$("#fSegment").value="";fillDivisions()});
["#fView","#fPeriod","#fRegion","#fSegment"].forEach(s=>$(s).addEventListener("change",renderKpi));
$("#kpis").addEventListener("click",e=>{const b=e.target.closest("[data-kpi]");if(b)kpiInfo(b.dataset.kpi)});
function kpiInfo(id){
  const k=KPIS.find(x=>x.id===id),sql=k.sql({...filters(),deny:[]});
  modal(`<h3>${esc(k.label)} <span class="badge b-cert">Certified</span></h3><p>${esc(k.def)}</p>
    <dl class="kv"><dt>Business owner</dt><dd>${esc(k.owner)}</dd><dt>Data steward</dt><dd>${esc(k.steward)}</dd><dt>Refresh</dt><dd>${esc(k.refresh)}</dd><dt>Source</dt><dd>Gold · semantic layer</dd></dl>
    <pre>${esc(sql)}</pre><button class="primary" id="toSql">Open in SQL Lab</button>`);
  $("#toSql").onclick=()=>{$("#modal").hidden=true;openInSql(sql)};
}

/* ---------- schedule & odds ---------- */
const LIVE_WEEK=11;let contractHeld=false,feedOn=true,lastTick=Date.now(),flashIds=new Set();
const nick=t=>t.split(" ").slice(-1)[0];
const mlFrom=p=>p>=.5?-Math.round(100*p/(1-p)):Math.round(100*(1-p)/p);
const pHome=s=>1/(1+Math.exp(.155*s));
const sgn=n=>n>0?"+"+n:n===0?"PK":String(n).replace("-","−");
const fmtSpread=n=>n===0?"PK":(n>0?"+":"−")+Math.abs(n);
function renderOdds(){
  const sel=$("#oWeek");
  if(!sel.options.length){for(let w=LIVE_WEEK;w>=1;w--)sel.insertAdjacentHTML("beforeend",`<option value="${w}">2026 · Week ${w}${w===LIVE_WEEK?" (upcoming · live)":""}</option>`)}
  const w=+sel.value||LIVE_WEEK,live=w===LIVE_WEEK;
  const g=rows(`SELECT g.game_id id, g.game_date d, g.kickoff_et k, g.game_window win, g.network net, ht.team home, at.team away, g.home_score hs, g.away_score as_,
      o.open_spread os, o.current_spread cs, o.open_total ot, o.current_total ct, o.home_moneyline hml, o.away_moneyline aml, o.home_handle_pct hh
    FROM dim_game g JOIN fact_odds o ON o.game_id=g.game_id JOIN dim_team ht ON ht.team_id=g.home_team_id JOIN dim_team at ON at.team_id=g.away_team_id
    WHERE g.season=2026 AND g.week=${w} ORDER BY g.game_date, CASE WHEN g.kickoff_et LIKE '1:%' THEN 1 WHEN g.kickoff_et LIKE '4:%' THEN 2 ELSE 3 END`);
  const ats=one(`SELECT ROUND(100.0*SUM(CASE WHEN (o.current_spread<0 AND g.home_score+o.current_spread>g.away_score) OR (o.current_spread>0 AND g.away_score-o.current_spread>g.home_score) THEN 1 ELSE 0 END)/COUNT(*),1)
    FROM fact_odds o JOIN dim_game g ON g.game_id=o.game_id WHERE g.season=2026 AND g.week<${live?w:w+1} AND g.home_score IS NOT NULL AND o.current_spread<>0`);
  const big=g.slice().sort((a,b)=>Math.abs(b.cs-b.os)-Math.abs(a.cs-a.os))[0];
  $("#oStats").innerHTML=[["Games",g.length,`${g.filter(x=>["Thursday Night","Sunday Night","Monday Night"].includes(x.win)).length} in primetime`],
    ["Biggest line move",big?Math.abs(big.cs-big.os).toFixed(1)+" pts":"–",big?`${nick(big.away)} @ ${nick(big.home)}`:""],
    ["Avg total (O/U)",(g.reduce((a,x)=>a+x.ct,0)/g.length).toFixed(1),"points per game"],
    ["Favorites ATS · 2026",ats==null?"–":ats+"%",live?"weeks 1–10":`through week ${w}`]].map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${esc(c)}</small></div>`).join("");
  const mv=(o,c)=>o===c?"":`<span class="${c<o?"mv-dn":"mv-up"}"> ${c<o?"▼":"▲"} from ${o}</span>`;
  $("#oTable").innerHTML=table(["Kickoff (ET) · network","Matchup","Spread","Total","Moneyline","Home win prob","Handle on home",...(live?[]:["Result"])],g.map(x=>{
    const favHome=x.cs<0,p=pHome(x.cs),fl=flashIds.has(x.id)?" flash":"";
    const day=new Date(x.d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
    let res="Scheduled";
    if(x.hs!=null){const margin=x.hs-x.as_,cover=x.cs===0?"":(margin+x.cs>0?nick(x.home):margin+x.cs<0?nick(x.away):"Push")+" covered",ou=x.hs+x.as_>x.ct?"Over":x.hs+x.as_<x.ct?"Under":"Push";
      res=`<b>${x.as_}–${x.hs}</b><span class="sub">${cover} · ${ou}</span>`}
    const ofl=favHome?x.os:-x.os,mvS=x.os===x.cs?"":`<span class="${Math.abs(x.cs)>Math.abs(ofl)||Math.sign(ofl)!==Math.sign(-Math.abs(x.cs))?"mv-up":"mv-dn"}"> from ${fmtSpread(ofl)}</span>`;
    return [`${day} · ${x.k}<span class="sub">${esc(x.net)}</span>`,
      `${favHome?"":"<b>"}${esc(nick(x.away))}${favHome?"":"</b>"} @ ${favHome?"<b>":""}${esc(nick(x.home))}${favHome?"</b>":""}`,
      `<span class="cell${fl}">${esc(nick(favHome?x.home:x.away))} ${fmtSpread(-Math.abs(x.cs))}</span>${mvS}`,
      `O/U ${x.ct}${mv(x.ot,x.ct)}`,
      `${esc(nick(x.away))} ${sgn(x.aml)}<span class="sub">${esc(nick(x.home))} ${sgn(x.hml)}</span>`,
      `<span class="pbar"><i style="width:${(p*100).toFixed(0)}%"></i></span>${(p*100).toFixed(0)}%`,
      `<span class="pbar"><i style="width:${x.hh}%;background:var(--c3)"></i></span>${x.hh}%`,...(live?[]:[res])];
  }));
  $("#oTable").querySelectorAll(".cell.flash").forEach(c=>c.closest("td").classList.add("flash"));
  flashIds.clear();banner();
}
function banner(){
  const b=$("#oBanner");if(!b)return;
  const w=+$("#oWeek").value||LIVE_WEEK;
  health();
  if(w!==LIVE_WEEK){b.className="live past";b.textContent=`Week ${w} final · closing lines`;return}
  const age=Math.round((Date.now()-lastTick)/1000);
  if(contractHeld){b.className="live stale";b.textContent=`Feed held by data contract – vendor schema change quarantined ${age}s ago. Serving last good lines; on-call alerted.`;return}
  if(!feedOn&&age>=60){b.className="live stale";b.textContent=`Odds feed stale – last update ${age}s ago. Freshness check failing; data owners alerted.`}
  else b.className="live",b.textContent=feedOn?`LIVE · consensus lines · updated ${age}s ago (simulated feed)`:`Feed paused · last update ${age}s ago`;
}
function tick(){
  if(!feedOn||!db||contractHeld)return;
  const up=rows(`SELECT o.game_id id, o.current_spread cs, o.current_total ct, o.home_handle_pct hh FROM fact_odds o JOIN dim_game g ON g.game_id=o.game_id WHERE g.season=2026 AND g.week=${LIVE_WEEK}`);
  const now=new Date().toISOString().replace("T"," ").slice(0,19);
  for(let k=0;k<1+Math.floor(Math.random()*2);k++){
    const x=up[Math.floor(Math.random()*up.length)];
    let cs=x.cs,ct=x.ct,hh=x.hh;
    if(Math.random()<.6)cs=Math.round((cs+(Math.random()<.5?-.5:.5))*2)/2;else ct=Math.round((ct+(Math.random()<.5?-.5:.5))*2)/2;
    hh=Math.max(15,Math.min(85,hh+Math.round((Math.random()-.5)*4)));
    const p=pHome(cs);
    db.run(`UPDATE fact_odds SET current_spread=${cs}, current_total=${ct}, home_handle_pct=${hh}, home_moneyline=${mlFrom(Math.min(.97,p+.02))}, away_moneyline=${mlFrom(Math.min(.97,1-p+.02))} WHERE game_id=${x.id}`);
    flashIds.add(x.id);
  }
  db.run(`UPDATE fact_odds SET updated_at='${now}' WHERE game_id IN (SELECT game_id FROM dim_game WHERE season=2026 AND week=${LIVE_WEEK})`);
  lastTick=Date.now();
  if(current==="odds"&&(+$("#oWeek").value||LIVE_WEEK)===LIVE_WEEK)renderOdds();
}
$("#oWeek").addEventListener("change",renderOdds);
$("#feedBtn").onclick=()=>{feedOn=!feedOn;$("#feedBtn").textContent=feedOn?"Pause feed":"Resume feed";if(feedOn)tick();banner()};
setInterval(tick,3500);setInterval(banner,1000);

/* ---------- Monday exec brief ---------- */
function weekly(season){
  return rows(`WITH v AS (SELECT g.week, SUM(CASE WHEN v.platform='Streaming' THEN v.avg_viewers_m ELSE 0 END) sv, SUM(v.avg_viewers_m) tv, COUNT(DISTINCT g.game_id) ng
      FROM fact_viewership v JOIN dim_game g ON g.game_id=v.game_id WHERE g.season=${season} GROUP BY g.week),
    a AS (SELECT g.week, 100.0*SUM(a.scanned_attendance)/SUM(a.capacity) att, SUM(a.ticket_revenue) tix FROM fact_game_attendance a JOIN dim_game g ON g.game_id=a.game_id WHERE g.season=${season} GROUP BY g.week),
    d AS (SELECT g.week, SUM(d.ad_spend) spend, 1000.0*SUM(CASE WHEN d.platform='Streaming' THEN d.ad_spend END)/SUM(CASE WHEN d.platform='Streaming' THEN d.impressions END) scpm,
             1000.0*SUM(CASE WHEN d.platform<>'Streaming' THEN d.ad_spend END)/SUM(CASE WHEN d.platform<>'Streaming' THEN d.impressions END) ncpm
      FROM fact_ad_delivery d JOIN dim_game g ON g.game_id=d.game_id WHERE g.season=${season} GROUP BY g.week)
    SELECT a.week, v.sv, v.tv/v.ng avgv, a.att, a.tix, d.spend, d.scpm, d.ncpm FROM a JOIN v ON v.week=a.week JOIN d ON d.week=a.week ORDER BY a.week`);
}
const SERIES=[["sv","Streaming viewers (M, total)","M"],["avgv","Avg viewers per game (M)","M"],["att","Attendance %","%"],["spend","Ad spend","$"],["scpm","Streaming CPM","$c"],["ncpm","Network CPM","$c"]];
const fv=(v,u)=>u==="$"?money(v):u==="$c"?"$"+v.toFixed(2):u==="%"?v.toFixed(1)+"%":v.toFixed(1)+"M";
// Robust baseline: once a point is flagged, later baselines use its expected value, so one outage can't mask the next anomaly.
function scan(w,k){
  const clean=w.map(r=>r[k]),res=[];
  for(let i=0;i<w.length;i++){
    if(i<4){res.push(null);continue}
    const prev=clean.slice(i-4,i),m=prev.reduce((a,b)=>a+b,0)/4,sd=Math.sqrt(prev.reduce((a,b)=>a+(b-m)**2,0)/3)||1e-9;
    const z=(w[i][k]-m)/sd,rel=(w[i][k]-m)/m,flag=Math.abs(z)>2.5&&Math.abs(rel)>.08;
    res.push({m,sd,z,rel,flag});if(flag)clean[i]=m;
  }
  return res;
}
function anomalies(w){
  const out=[];
  SERIES.forEach(([k,label,u])=>scan(w,k).forEach((s,i)=>{if(s&&s.flag)out.push({week:w[i].week,k,label,u,val:w[i][k],exp:s.m,z:s.z,rel:s.rel})}));
  return out.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
}
function renderBrief(){
  const w=weekly(2026),cur=w[w.length-1],prv=w[w.length-2],P=PAL();
  const pct=(a,b)=>(100*(a-b)/b);
  const arrow=d=>`<span class="${d>=0?"up":"down"}">${d>=0?"▲":"▼"} ${Math.abs(d).toFixed(1)}%</span>`;
  const subsNow=one(`SELECT COUNT(*) FROM fact_subscriptions WHERE start_date<='${AS_OF}' AND (end_date IS NULL OR end_date>'${AS_OF}')`);
  const subs4=one(`SELECT COUNT(*) FROM fact_subscriptions WHERE start_date<='${shift(AS_OF,-28)}' AND (end_date IS NULL OR end_date>'${shift(AS_OF,-28)}')`);
  $("#brSub").textContent=`Week ${cur.week} · 2026 season · generated automatically from certified metrics every Monday at 7:00 AM ET.`;
  $("#brCards").innerHTML=[["Avg viewers / game",cur.avgv.toFixed(1)+"M",arrow(pct(cur.avgv,prv.avgv))+" vs Wk "+prv.week],["Attendance",cur.att.toFixed(1)+"%",`<span class="${cur.att>=prv.att?"up":"down"}">${cur.att>=prv.att?"▲":"▼"} ${Math.abs(cur.att-prv.att).toFixed(1)} pts</span> vs Wk ${prv.week}`],
    ["Ad spend",money(cur.spend),arrow(pct(cur.spend,prv.spend))+" vs Wk "+prv.week],["League+ subscribers",subsNow.toLocaleString(),arrow(pct(subsNow,subs4))+" vs 4 weeks ago"]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  const top=rows(`SELECT t.team, 100.0*SUM(a.scanned_attendance)/SUM(a.capacity) att FROM fact_game_attendance a JOIN dim_game g ON g.game_id=a.game_id JOIN dim_team t ON t.team_id=g.home_team_id WHERE g.season=2026 GROUP BY t.team ORDER BY att DESC`);
  const bw=rows(`WITH pg AS (SELECT g.game_id, g.game_window, ht.team home, at.team away, SUM(v.avg_viewers_m) v FROM fact_viewership v JOIN dim_game g ON g.game_id=v.game_id JOIN dim_team ht ON ht.team_id=g.home_team_id JOIN dim_team at ON at.team_id=g.away_team_id WHERE g.season=2026 AND g.week=${cur.week} GROUP BY g.game_id) SELECT * FROM pg ORDER BY v DESC LIMIT 1`)[0];
  const shareNow=100*cur.sv/(cur.avgv*16),dqFail=DQ.filter(d=>one(d[3])>0);
  const an=anomalies(w);
  $("#brBullets").innerHTML=[
    `<b>Audience:</b> ${cur.avgv.toFixed(1)}M average viewers per game in Week ${cur.week} (${pct(cur.avgv,prv.avgv)>=0?"up":"down"} ${Math.abs(pct(cur.avgv,prv.avgv)).toFixed(1)}% week over week). Most-watched: ${esc(bw.away)} at ${esc(bw.home)} (${bw.game_window}, ${bw.v.toFixed(1)}M).`,
    `<b>Streaming:</b> ${cur.sv.toFixed(1)}M streaming viewers this week; streaming CPM $${cur.scpm.toFixed(2)} vs network $${cur.ncpm.toFixed(2)} – a ${(100*(cur.scpm-cur.ncpm)/cur.ncpm).toFixed(0)}% premium for addressable inventory.`,
    `<b>Stadiums:</b> attendance ${cur.att.toFixed(1)}% of capacity. Season leaders: ${esc(top[0].team)} (${top[0].att.toFixed(1)}%) and ${esc(top[1].team)}; lowest: ${esc(top[top.length-1].team)} (${top[top.length-1].att.toFixed(1)}%).`,
    `<b>Revenue:</b> ${money(cur.spend)} ad spend and ${money(cur.tix)} ticket revenue in Week ${cur.week}.`,
    `<b>League+:</b> ${subsNow.toLocaleString()} active subscribers, ${pct(subsNow,subs4)>=0?"up":"down"} ${Math.abs(pct(subsNow,subs4)).toFixed(1)}% in four weeks. Churn-risk list refreshed nightly (see Churn model).`,
    `<b>Data health:</b> ${dqFail.length} quality checks failing and ${an.length} anomal${an.length===1?"y":"ies"} flagged this season – details below.`].map(x=>`<li>${x}</li>`).join("");
  const cause=a=>a.k==="sv"||a.k==="avgv"?(a.week===8?"Ratings-feed outage on Thursday Night: ad server shows normal delivery. Ratings vs ad-server reconciliation check fails. Ticket open with partner.":"Investigate"):"Investigate";
  $("#brAnomTable").innerHTML=an.length?table(["Week","Metric","Actual","Expected","z","Likely cause"],an.map(a=>[a.week,esc(a.label),fv(a.val,a.u),fv(a.exp,a.u),`<span class="badge ${Math.abs(a.z)>4?"b-bad":"b-warn"}">${a.z.toFixed(1)}σ</span>`,`<span class="wrap">${esc(cause(a))}</span>`]),[2,3]):'<p class="muted">No anomalies this season.</p>';
  $("#brAnomTable").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
  const band=scan(w,"sv").map(s=>s&&[s.m-2.5*s.sd,s.m+2.5*s.sd]);
  mkChart("cAnom",{data:{labels:w.map(r=>"Wk "+r.week),datasets:[
    {type:"line",label:"Expected range (±2.5σ)",data:band.map(b=>b&&b[1]),borderColor:"transparent",backgroundColor:"rgba(36,87,214,.12)",fill:"+1",pointRadius:0},
    {type:"line",label:"_lo",data:band.map(b=>b&&b[0]),borderColor:"transparent",pointRadius:0,fill:false},
    {type:"line",label:"Streaming viewers (M)",data:w.map(r=>r.sv),borderColor:P[3],tension:.25,pointRadius:w.map(r=>an.some(a=>a.k==="sv"&&a.week===r.week)?6:2),pointBackgroundColor:w.map(r=>an.some(a=>a.k==="sv"&&a.week===r.week)?"#c0392b":P[3])}]},
    options:{maintainAspectRatio:false,plugins:{legend:{labels:{filter:i=>!i.text.startsWith("_")}}}}});
  renderAlert(an);
  $("#brDq").innerHTML=dqFail.length?`<ul class="bullets">${dqFail.map(d=>`<li><b>${esc(d[0])}</b> <span class="muted">(${esc(d[1])} · ${d[4]} severity)</span> – owner notified; data held from certified dashboards until resolved.</li>`).join("")}</ul>`:'<p class="muted">No incidents.</p>';
}
$("#brPrint").onclick=()=>window.print();

/* ---------- Ask the data ---------- */
let askN=0;
function renderAsk(){
  $("#askChips").innerHTML=ASK_SUGGEST.map(s=>`<button type="button" class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join("");
  $("#askChips").onclick=e=>{const c=e.target.closest("[data-ask]");if(c){$("#askInput").value=c.dataset.ask;ask(c.dataset.ask)}};
  $("#askForm").onsubmit=e=>{e.preventDefault();const v=$("#askInput").value.trim();if(v)ask(v)};
}
function ask(question){
  const t=question.toLowerCase(),id="ask"+(++askN),role=$("#fView").value||"exec",deny=(VIEW[role]||VIEW.exec).deny;
  const it=ASK.find(x=>x.test.test(t));
  const wrap=document.createElement("div");wrap.className="qa";wrap.innerHTML=`<div class="q">${esc(question)}</div><div class="a"><span class="thinking">Matching to certified metrics…</span></div>`;
  $("#askLog").prepend(wrap);
  setTimeout(()=>{
    const A=wrap.querySelector(".a");
    if(!it){A.innerHTML=`<p>I can answer questions about attendance, ticketing, viewership, streaming vs network ads, merchandise, League+ subscribers, odds, data quality and pipelines. Try one of the suggestions above.</p>`;return}
    if(it.blocked){wrap.classList.add("blocked");
      A.innerHTML=`<p><b>🔒 Blocked by policy.</b> ${esc(it.msg)}</p><p class="muted">Policy: ${it.blocked==="health"?"Restricted health data – Lake Formation grants aggregated views only.":"PII – contact_email is masked for analytics roles."} Logged to CloudTrail.</p><button class="ghost" type="button" data-ask-alt="${esc(it.alt)}">Show ${esc(it.alt)} instead</button>`;
      A.querySelector("[data-ask-alt]").onclick=()=>ask(it.alt);return}
    if(it.metric&&deny.includes(it.metric)){wrap.classList.add("blocked");
      A.innerHTML=`<p><b>🔒 Not available for your role.</b> The current "View as" role (${esc($("#fView").selectedOptions[0].text)}) doesn't have access to ${esc(KPIS.find(k=>k.id===it.metric).label)}.</p>`;return}
    const k=it.metric?KPIS.find(x=>x.id===it.metric):null;
    if(it.dq){const res=DQ.map(d=>[d,one(d[3])]).filter(([,n])=>n>0);
      A.innerHTML=`<dl class="steps"><dt>Interpreted as</dt><dd>${esc(it.label)}</dd><dt>Source</dt><dd>Automated quality checks (Governance)</dd></dl>`+table(["Check","Table","Severity","Failing rows"],res.map(([d,n])=>[esc(d[0]),`<code>${d[1]}</code>`,d[4],n]),[3]);return}
    const sql=it.sql(t);let r;
    try{r=q(sql)}catch(err){A.innerHTML=`<p class="err">${esc(err.message)}</p>`;return}
    const ys=it.ys||r.columns.map((_,i)=>i).filter(i=>i>0&&r.values.every(v=>typeof v[i]==="number"));
    A.innerHTML=`<dl class="steps"><dt>Interpreted as</dt><dd>${esc(it.label)}${it.noSeason?"":/2025/.test(t)?" · 2025 season":" · 2026 season"}${CONF_OF(t)?" · "+CONF_OF(t):""}</dd>
      <dt>Certified metric</dt><dd>${k?`<a href="#" data-kinfo="${k.id}">${esc(k.label)}</a> <span class="badge b-cert">Certified</span>`:'<span class="muted">Governed Gold tables</span>'}</dd>
      <dt>Access check</dt><dd>✅ Allowed for ${esc($("#fView").selectedOptions[0].text)}</dd></dl>
      <details><summary>Show generated SQL</summary><pre class="code">${esc(sql)}</pre><button class="ghost" type="button" data-tosql>Open in SQL Lab</button></details>
      ${it.chart?`<div class="chartbox sm"><canvas id="${id}"></canvas></div>`:""}
      <div class="tablewrap">${table(r.columns,r.values.slice(0,12).map(v=>v.map(x=>x==null?"–":esc(typeof x==="number"&&!Number.isInteger(x)?x.toFixed(2):x))),ys)}</div>
      ${it.note?`<p class="muted">${esc(it.note)}</p>`:""}`;
    const ks=A.querySelector("[data-kinfo]");if(ks)ks.onclick=e=>{e.preventDefault();kpiInfo(ks.dataset.kinfo)};
    A.querySelector("[data-tosql]").onclick=()=>openInSql(sql);
    if(it.chart){const P=PAL();mkChart(id,{type:it.chart,data:{labels:r.values.map(v=>it.chart==="line"&&typeof v[0]==="number"?"Wk "+v[0]:v[0]),datasets:ys.slice(0,2).map((yi,j)=>({label:r.columns[yi],data:r.values.map(v=>v[yi]),backgroundColor:P[j],borderColor:P[j],borderRadius:4,tension:.3}))},
      options:{maintainAspectRatio:false,indexAxis:it.chart==="bar"&&r.values.length>6?"y":"x",plugins:{legend:{display:ys.length>1}}}})}
  },550);
}

/* ---------- churn model ---------- */
let churnRows=[];
function churnScore(f){const c=CHURN_MODEL.coef;let z=CHURN_MODEL.intercept;Object.keys(c).forEach(k=>z+=c[k]*f[k]);return 1/(1+Math.exp(-z))}
function renderChurn(){
  const data=rows(`WITH m AS (SELECT fan_id, SUM(revenue) spend FROM fact_merch_orders GROUP BY fan_id)
    SELECT s.sub_id, s.fan_id, s.plan, s.start_date, s.end_date, s.monthly_price, f.segment, f.state, t.team, t.state team_state, COALESCE(m.spend,0) spend
    FROM fact_subscriptions s JOIN dim_fan f ON f.fan_id=s.fan_id JOIN dim_team t ON t.team_id=f.home_team_id LEFT JOIN m ON m.fan_id=s.fan_id`);
  data.forEach(d=>{d.x={basic_plan:d.plan==="Basic"?1:0,casual_segment:d.segment==="Casual"?1:0,streaming_first:d.segment==="Streaming-first"?1:0,season_ticket:d.segment==="Season Ticket Holder"?1:0,out_of_market:d.state!==d.team_state?1:0,merch_spend_log:Math.log1p(d.spend)/Math.log1p(500)};d.p=churnScore(d.x);
    const contrib=Object.entries(CHURN_MODEL.coef).map(([k,c])=>[k,c*d.x[k]]).sort((a,b)=>b[1]-a[1]);d.reason=CHURN_MODEL.labels[contrib[0][0]]});
  // AUC on cohorts with a known outcome (started before 2026)
  const lab=data.filter(d=>d.start_date<"2026-01-01"),pos=lab.filter(d=>d.end_date),neg=lab.filter(d=>!d.end_date);
  const sorted=lab.slice().sort((a,b)=>a.p-b.p);let rank=0,sumPos=0;sorted.forEach((d,i)=>{if(d.end_date)sumPos+=i+1});
  const auc=(sumPos-pos.length*(pos.length+1)/2)/(pos.length*neg.length);
  const act=data.filter(d=>!d.end_date),tier=p=>p>=.5?"High":p>=.3?"Medium":"Low";
  act.forEach(d=>d.tier=tier(d.p));
  const hi=act.filter(d=>d.tier==="High"),rev=hi.reduce((a,d)=>a+d.monthly_price*12*d.p,0);
  churnRows=act.sort((a,b)=>b.p-a.p);
  $("#chTop").innerHTML=[["Active subscribers scored",act.length.toLocaleString(),"nightly batch · SageMaker"],["High risk (≥ 50%)",hi.length.toLocaleString(),`${(100*hi.length/act.length).toFixed(1)}% of active base`],
    ["Annual revenue at risk",money(rev),"high tier · price × 12 × probability"],["Model AUC",auc.toFixed(2),`validated on ${lab.length.toLocaleString()} subscribers with known outcomes`]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  const P=PAL(),cf=Object.entries(CHURN_MODEL.coef).sort((a,b)=>b[1]-a[1]);
  mkChart("cDrivers",{type:"bar",data:{labels:cf.map(([k])=>CHURN_MODEL.labels[k]),datasets:[{data:cf.map(([,v])=>v),backgroundColor:cf.map(([,v])=>v>0?"#d64a6f":"#1d7f45"),borderRadius:4}]},
    options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` coefficient ${c.raw.toFixed(2)}`}}}}});
  const segs=[...new Set(act.map(d=>d.segment))];
  mkChart("cTiers",{type:"bar",data:{labels:segs,datasets:["High","Medium","Low"].map((tname,j)=>({label:tname,data:segs.map(s=>act.filter(d=>d.segment===s&&d.tier===tname).length),backgroundColor:["#c0392b","#e08a1e","#16a3a3"][j]}))},
    options:{maintainAspectRatio:false,scales:{x:{stacked:true},y:{stacked:true}}}});
  $("#chList").innerHTML=table(["Fan ID","Segment","Plan","Club","Risk","Top driver"],churnRows.slice(0,12).map(d=>[d.fan_id,esc(d.segment),d.plan,esc(d.team),`<span class="badge ${d.tier==="High"?"b-bad":"b-warn"}">${(100*d.p).toFixed(0)}%</span>`,esc(d.reason)]),[0]);
  $("#chCard").innerHTML=[["Model",CHURN_MODEL.version],["Algorithm","Logistic regression – chosen for explainability"],["Trained on",CHURN_MODEL.trained],["Validation AUC",auc.toFixed(2)],["Owner",CHURN_MODEL.owner],["Output",CHURN_MODEL.refresh],
    ["Drift monitor","✅ Feature distributions within tolerance (PSI < 0.1)"],["Governance","Uses no PII · fan IDs only · approved by Data Governance"],["Business use","Retention offers before the off-season churn window (Feb–Mar)"]]
    .map(([a,b])=>`<dt>${a}</dt><dd>${esc(b)}</dd>`).join("");
}
$("#chCsv").onclick=()=>{
  const lines=["fan_id,segment,plan,club,churn_probability,risk_tier,top_driver",...churnRows.filter(d=>d.tier!=="Low").map(d=>[d.fan_id,d.segment,d.plan,`"${d.team}"`,d.p.toFixed(3),d.tier,`"${d.reason}"`].join(","))];
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/csv"}));a.download="league-plus-retention-targets.csv";a.click();
};

/* ---------- guided tour ---------- */
let tourI=-1;
function tourGo(i){
  document.querySelectorAll(".tour-hl").forEach(e=>e.classList.remove("tour-hl"));
  if(i<0||i>=TOUR.length){tourI=-1;$("#tourBox").hidden=true;return}
  tourI=i;const st=TOUR[i];show(st.tab,"replace");
  setTimeout(()=>{const el=$(st.sel);if(el){const target=el.tagName==="SELECT"?el.closest("label"):el;target.classList.add("tour-hl");target.scrollIntoView({behavior:"smooth",block:"center"})}},120);
  $("#tourText").textContent=st.text;$("#tourStep").textContent=`Step ${i+1} of ${TOUR.length}`;$("#tourBox").hidden=false;
  $("#tourBack").disabled=i===0;$("#tourNext").textContent=i===TOUR.length-1?"Finish":"Next →";
}
$("#tourBtn").onclick=()=>tourGo(0);$("#tourNext").onclick=()=>tourGo(tourI+1);$("#tourBack").onclick=()=>tourGo(tourI-1);$("#tourExit").onclick=()=>tourGo(-1);
document.addEventListener("keydown",e=>{
  if(e.target.closest&&e.target.closest("input,textarea,select,.CodeMirror"))return;
  if(tourI>=0){if(e.key==="ArrowRight")tourGo(tourI+1);else if(e.key==="ArrowLeft")tourGo(tourI-1);else if(e.key==="Escape")tourGo(-1)}
  else if(e.key.toLowerCase()==="t"&&!e.metaKey&&!e.ctrlKey)tourGo(0);
});

/* ---------- warehouse & pipelines ---------- */
function renderWh(){
  const last=rows(`SELECT r.* FROM etl_job_runs r JOIN (SELECT job, MAX(run_id) m FROM etl_job_runs GROUP BY job) x ON x.m=r.run_id ORDER BY r.run_id`);
  const col={},clr=st=>st==="Failed"?"#fbe5e2":st==="Success"?"#e2f4e8":"#fdf1d8";
  last.forEach(r=>col[r.job]=clr(r.status));
  const tot=one("SELECT COUNT(*) FROM etl_job_runs"),fail=one("SELECT COUNT(*) FROM etl_job_runs WHERE status='Failed'");
  const cost=rows("SELECT AVG(CASE WHEN date < '2026-11-02' THEN compute_credits END) b, AVG(CASE WHEN date >= '2026-11-02' THEN compute_credits END) a FROM warehouse_cost_daily")[0];
  const lat=one("SELECT SUM(duration_s) FROM etl_job_runs WHERE run_id IN (SELECT MAX(run_id) FROM etl_job_runs WHERE status LIKE 'Success%' GROUP BY job)");
  $("#whStats").innerHTML=[["Tables by layer","6 · 5 · 7","Bronze · Silver · Gold"],["Pipeline success (14 days)",(100*(tot-fail)/tot).toFixed(1)+"%",`${fail} failure, auto-rerun before publish`],
    ["Source → dashboard",Math.round(lat/60)+" min","nightly batch end to end · odds live < 60 s"],["Compute cost","−"+Math.abs(Math.round(100*(cost.a-cost.b)/cost.b))+"%","daily credits since Nov 2 optimization"]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  $("#whDag").innerHTML=flow(DAG,true,col);
  const badge=st=>`<span class="badge ${st==="Failed"?"b-bad":st==="Success"?"b-cert":"b-warn"}">${st}</span>`;
  $("#whRuns").innerHTML=table(["Job","Layer","Load pattern","Physical design","Last run (UTC)","Duration","Rows","Status"],last.map(r=>[`<code>${esc(r.job)}</code>`,r.layer,esc(r.load_pattern),`<span class="muted">${esc(PHYS[r.job]||"–")}</span>`,
    r.started_at.slice(5,16),r.duration_s==null?"…":r.duration_s+" s",r.rows_processed==null?"…":r.rows_processed.toLocaleString(),badge(r.status)]),[5,6]);
  const scd=q("SELECT team_key, team, surface, stadium_capacity, valid_from, valid_to, is_current FROM dim_team_scd WHERE team_id IN (SELECT team_id FROM dim_team_scd WHERE is_current=0) ORDER BY team, valid_from");
  $("#whScd").innerHTML=table(["Key","Team","Surface","Capacity","Valid from → to","Current"],scd.values.map(v=>[v[0],esc(nick(v[1])),v[2],v[3].toLocaleString(),`${v[4]} → ${v[5]==="9999-12-31"?"open":v[5]}`,v[6]?'<span class="badge b-cert">Yes</span>':'<span class="badge">No</span>']),[0,3]);
  $("#scdBtn").onclick=()=>openInSql(SCD_SQL);
  document.querySelector("#tab-wh pre.code").textContent=SEMANTIC;
  const c=rows("SELECT date, compute_credits cr, avg_query_s qs FROM warehouse_cost_daily ORDER BY date"),P=PAL();
  mkChart("cCost",{data:{labels:c.map(r=>new Date(r.date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),datasets:[
    {type:"bar",label:"Compute credits",data:c.map(r=>r.cr),backgroundColor:c.map(r=>r.date>="2026-11-02"?P[1]:"#9fb3c8"),yAxisID:"y",order:2},
    {type:"line",label:"Avg query time (s)",data:c.map(r=>r.qs),borderColor:P[2],backgroundColor:P[2],pointRadius:0,tension:.3,yAxisID:"y1",order:0}]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},scales:{y:{title:{display:true,text:"Credits / day"}},y1:{position:"right",grid:{display:false},title:{display:true,text:"Seconds"}}}}});
  $("#whPractices").innerHTML=`<div class="prac">${PRACTICES.map(([a,b])=>`<b>${esc(a)}</b><span>${esc(b)}</span>`).join("")}</div>`;
}

/* ---------- ERD ---------- */
const BW=220,HH=28,RH=20;
function renderErd(view="star"){
  document.querySelectorAll("[data-erd]").forEach(b=>b.classList.toggle("on",b.dataset.erd===view));
  if(view==="arch"){$("#erd").innerHTML=flow(ARCH);return}
  if(view==="lineage"){$("#erd").innerHTML=flow(LINEAGE);return}
  const S={intl:ERD_INTL,recon:ERD_RECON}[view]||ERD,T=S.tables,anchor=(t,c)=>T[t].y+HH+T[t].cols.findIndex(x=>x[0]===c)*RH+RH/2;
  let s=`<svg viewBox="0 0 1130 ${S.height||690}" role="img" aria-label="${{intl:"International fan journey mart",recon:"Fan activation and survey reconciliation"}[view]||"Star schema"} entity relationship diagram">`;
  S.rels.forEach(([a,ac,b,bc],i)=>{
    const A=T[a],B=T[b],y1=anchor(a,ac),y2=anchor(b,bc);let d,x1,x2;
    if(Math.abs(A.x-B.x)<50){x1=A.x+BW;x2=B.x+BW;d=`M${x1},${y1} C${x1+50},${y1} ${x2+50},${y2} ${x2},${y2}`}
    else{const r=B.x>A.x;x1=r?A.x+BW:A.x;x2=r?B.x:B.x+BW;const dx=(x2-x1)/2;d=`M${x1},${y1} C${x1+dx},${y1} ${x2-dx},${y2} ${x2},${y2}`}
    const sx=Math.sign(x2-x1)||1;
    s+=`<path class="rel" data-a="${a}" data-b="${b}" d="${d}"/>`+
      `<text x="${x1+sx*8}" y="${y1-4}" font-size="10" fill="#5d6b7a" text-anchor="middle">N</text><text x="${x2-sx*8}" y="${y2-4}" font-size="10" fill="#5d6b7a" text-anchor="middle">1</text>`;
  });
  Object.entries(T).forEach(([n,t])=>{
    const h=HH+t.cols.length*RH+6,fact=n.startsWith("fact");
    s+=`<g class="tbl" data-t="${n}" tabindex="0"><rect class="box" x="${t.x}" y="${t.y}" width="${BW}" height="${h}" rx="8"/>`+
      `<rect x="${t.x}" y="${t.y}" width="${BW}" height="${HH}" rx="8" fill="${fact?"#2457d6":"#16a3a3"}"/><rect x="${t.x}" y="${t.y+HH-8}" width="${BW}" height="8" fill="${fact?"#2457d6":"#16a3a3"}"/>`+
      `<text x="${t.x+10}" y="${t.y+18}" fill="#fff" style="fill:#fff" font-weight="700" class="mono">${n}</text>`;
    t.cols.forEach(([c,ty,k],i)=>{const y=t.y+HH+i*RH+14;
      s+=`<text x="${t.x+10}" y="${y}" class="mono">${c}</text><text x="${t.x+BW-12}" y="${y}" class="mono" text-anchor="end" fill="#8a98a8" style="fill:#8a98a8">${ty}</text>`+
        (k?`<text x="${t.x+BW-48}" y="${y}" text-anchor="end" font-size="9.5" font-weight="700" style="fill:${k==="PK"?"#a46a00":k==="FK"?"#2457d6":"#c0392b"}">${k}</text>`:"")});
    s+=`</g>`;
  });
  $("#erd").innerHTML=s+`</svg>`;
  const svg=$("#erd svg");
  svg.querySelectorAll(".tbl").forEach(g=>{
    const t=g.dataset.t,hot=on=>svg.querySelectorAll(".rel").forEach(p=>p.classList.toggle("hot",on&&(p.dataset.a===t||p.dataset.b===t)));
    g.addEventListener("mouseenter",()=>hot(true));g.addEventListener("mouseleave",()=>hot(false));
    const pickT=()=>{svg.querySelectorAll(".tbl").forEach(x=>x.classList.toggle("sel",x===g));erdInfo(t,S)};
    g.addEventListener("click",pickT);g.addEventListener("keydown",e=>{if(e.key==="Enter")pickT()});
  });
}
function erdInfo(t,S=ERD){
  const T=S.tables[t],n=one(`SELECT COUNT(*) FROM ${t}`),rel=S.rels.filter(r=>r[0]===t||r[2]===t);
  const cat=CATALOG.find(c=>c[0]===t),kind=t.startsWith("fact")?"Fact":t.startsWith("gov")?"Governed lookup":"Dimension";
  $("#erdInfo").innerHTML=`<h2>${t} <span class="badge ${t.startsWith("fact")?"b-info":"b-cert"}">${kind}</span> ${cat?`<span class="badge ${cat[4]==="PII"||cat[4]==="Restricted"?"b-bad":"b-warn"}">${cat[4]}</span>`:""}</h2>
    <p>${esc(T.desc)}</p><dl class="kv"><dt>Rows (live)</dt><dd>${n.toLocaleString()}</dd><dt>Owner</dt><dd>${esc(T.owner)}</dd>${cat?`<dt>Steward</dt><dd>${esc(cat[3])}</dd><dt>Freshness SLA</dt><dd>${esc(cat[5])}</dd>`:""}
    <dt>Joins</dt><dd>${rel.map(r=>`<code>${r[0]}.${r[1]} → ${r[2]}.${r[3]}</code>`).join("<br>")}</dd></dl>
    <button class="primary" id="erdQ">Query in SQL Lab</button>`;
  $("#erdQ").onclick=()=>openInSql(`SELECT *\nFROM ${t}\nLIMIT 50;`);
}
document.querySelectorAll("[data-erd]").forEach(b=>b.onclick=()=>renderErd(b.dataset.erd));

/* ---------- SQL Lab ---------- */
function renderSql(){
  const schema={};
  rows("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").forEach(({name})=>{
    schema[name]=q(`PRAGMA table_info(${name})`).values.map(v=>[v[1],v[2]]);
  });
  $("#schema").innerHTML=Object.entries(schema).map(([t,cols])=>`<details ${t==="dim_game"?"open":""}><summary>${t}</summary>
    <button class="ins" data-ins="${t}">+ SELECT * FROM ${t}</button><ul>${cols.map(([c,ty])=>`<li>${c}<em>${ty.toLowerCase()}</em></li>`).join("")}</ul></details>`).join("");
  $("#schema").onclick=e=>{const b=e.target.closest("[data-ins]");if(b)openInSql(`SELECT *\nFROM ${b.dataset.ins}\nLIMIT 50;`)};
  SAVED.forEach(([n],i)=>$("#savedQ").insertAdjacentHTML("beforeend",`<option value="${i}">${esc(n)}</option>`));
  $("#savedQ").onchange=e=>{if(e.target.value!==""){cm.setValue(SAVED[+e.target.value][1]);run()}};
  cm=CodeMirror.fromTextArea($("#sqlEditor"),{mode:"text/x-sqlite",lineNumbers:true,theme:"default",
    hintOptions:{tables:Object.fromEntries(Object.entries(schema).map(([t,c])=>[t,c.map(x=>x[0])]))},
    extraKeys:{"Ctrl-Enter":run,"Cmd-Enter":run,"Ctrl-Space":"autocomplete"}});
  cm.setValue(pendingSql||SAVED[0][1]);pendingSql=null;
  $("#runBtn").onclick=run;
  $("#fmtBtn").onclick=()=>cm.setValue(cm.getValue().replace(/\s+/g," ").replace(/\s*\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|LEFT JOIN|JOIN|WITH|UNION)\b/gi,"\n$1").replace(/,\s*/g,",\n       ").trim());
  $("#csvBtn").onclick=csv;$("#chartBtn").onclick=chartRes;
  run();
}
let pendingSql=null;
function openInSql(sql){if(cm){cm.setValue(sql);show("sql");run()}else{pendingSql=sql;show("sql")}}
function run(){
  const sql=cm.getValue(),t0=performance.now();
  $("#resErr").hidden=true;$("#resChartBox").hidden=true;
  try{
    const r=q(sql),ms=(performance.now()-t0).toFixed(1);lastRes=r;
    $("#resMeta").textContent=`${r.values.length.toLocaleString()} row${r.values.length===1?"":"s"} · ${ms} ms`;
    const num=r.columns.map((c,i)=>r.values.length&&r.values.slice(0,20).every(v=>v[i]==null||typeof v[i]==="number"));
    const shown=r.values.slice(0,500);
    $("#results").innerHTML=r.columns.length?table(r.columns,shown.map(v=>v.map((x,i)=>x==null?'<span class="muted">null</span>':esc(typeof x==="number"&&!Number.isInteger(x)?x.toFixed(2):x))),num.map((n,i)=>n?i:-1).filter(i=>i>=0))+(r.values.length>500?`<p class="muted">Showing first 500 rows.</p>`:""):`<p class="muted">Statement ran – no rows returned.</p>`;
    $("#csvBtn").disabled=!r.values.length;$("#chartBtn").disabled=!(r.columns.length>=2&&num.some(Boolean));
  }catch(e){$("#resErr").hidden=false;$("#resErr").textContent=e.message;$("#resMeta").textContent="Error";$("#csvBtn").disabled=$("#chartBtn").disabled=true}
}
function csv(){
  const c=v=>v==null?"":/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v;
  const text=[lastRes.columns.map(c).join(","),...lastRes.values.map(r=>r.map(c).join(","))].join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type:"text/csv"}));a.download="query-results.csv";a.click();
}
function chartRes(){
  const r=lastRes,numIdx=r.columns.map((_,i)=>i).filter(i=>r.values.every(v=>v[i]==null||typeof v[i]==="number"));
  const labelIdx=r.columns.findIndex((_,i)=>!numIdx.includes(i)),li=labelIdx<0?0:labelIdx;
  const series=numIdx.filter(i=>i!==li).slice(0,3),P=PAL(),data=r.values.slice(0,60);
  const isTime=/month|date|week/i.test(r.columns[li]);
  $("#resChartBox").hidden=false;
  if(resChart)resChart.destroy();
  resChart=new Chart($("#cRes"),{type:isTime?"line":"bar",data:{labels:data.map(v=>v[li]),datasets:series.map((i,k)=>({label:r.columns[i],data:data.map(v=>v[i]),backgroundColor:P[k],borderColor:P[k],borderRadius:4,tension:.3}))},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false}}});
}

/* ---------- roadmap ---------- */
const score=i=>Math.round(i.R*i.I*i.C/i.E);
const stCls={"In progress":"b-info","On track":"b-cert","At risk":"b-bad",Planned:"b-warn",Discovery:"b-warn",Idea:""};
function renderRoadmap(){
  $("#rmBoard").innerHTML=["Now","Next","Later"].map(h=>`<div class="col"><h2>${h}</h2>${ROADMAP.filter(i=>i.h===h).sort((a,b)=>score(b)-score(a)).map(i=>`
    <div class="item"><h3>${esc(i.t)}</h3><p>${esc(i.d)}</p>
      <div class="row"><span class="badge ${stCls[i.status]}">${i.status}</span><span class="badge b-info">${esc(i.team)}</span><span class="muted">${i.q}</span><span class="muted">RICE ${score(i)}</span></div>
      ${i.pct?`<div class="bar"><i style="width:${i.pct}%"></i></div>`:""}
      ${i.risk?`<div class="metric down">⚠ ${esc(i.risk)}</div>`:""}
      <div class="metric"><b>Success metric:</b> ${esc(i.metric)}</div></div>`).join("")}</div>`).join("");
  $("#rmDeps").innerHTML=`<h2>Dependencies &amp; risk log</h2>`+table(["Initiative","Depends on","Owner","Risk","Mitigation"],DEPS.map(d=>[esc(d[0]),esc(d[1]),esc(d[2]),`<span class="badge ${d[3]==="High"?"b-bad":d[3]==="Medium"?"b-warn":"b-cert"}">${d[3]}</span>`,esc(d[4])]))
    +`<h2 class="mt">Prioritization – RICE scores</h2>`+table(["Initiative","Reach","Impact","Confidence","Effort (sprints)","Score"],[...ROADMAP].sort((a,b)=>score(b)-score(a)).map(i=>[esc(i.t),i.R,i.I,Math.round(i.C*100)+"%",i.E,`<b>${score(i)}</b>`]),[1,2,3,4,5]);
  $("#rmDeps").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
}
function renderMatrix(){
  const P=PAL(),col={Now:P[0],Next:P[1],Later:P[2]};
  mkChart("cMatrix",{type:"bubble",data:{datasets:["Now","Next","Later"].map(h=>({label:h,backgroundColor:col[h]+"bb",borderColor:col[h],
    data:ROADMAP.filter(i=>i.h===h).map(i=>({x:i.E,y:Math.round(i.R*i.I*i.C),r:6+i.stake*2.2,t:i.t}))}))},
    options:{maintainAspectRatio:false,scales:{x:{title:{display:true,text:"Effort (sprints) →"},min:0,max:12},y:{title:{display:true,text:"Value (reach × impact × confidence) →"},min:0}},
      plugins:{tooltip:{callbacks:{label:c=>` ${c.raw.t}: value ${c.raw.y}, effort ${c.raw.x}`}}}}});
}
document.querySelectorAll("[data-rm]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("[data-rm]").forEach(x=>x.classList.toggle("on",x===b));
  $("#rmBoard").hidden=b.dataset.rm!=="board";$("#rmMatrix").hidden=b.dataset.rm!=="matrix";$("#rmDeps").hidden=b.dataset.rm!=="deps";
  if(b.dataset.rm==="matrix")renderMatrix();
});

/* ---------- governance ---------- */
function renderGov(){
  const res=DQ.map(d=>({d,fail:one(d[3])}));
  const pass=res.filter(r=>r.fail===0).length,crit=res.filter(r=>r.fail>0&&r.d[4]==="High").length;
  const rowsChecked=one("SELECT (SELECT COUNT(*) FROM fact_game_attendance)+(SELECT COUNT(*) FROM fact_viewership)+(SELECT COUNT(*) FROM fact_merch_orders)+(SELECT COUNT(*) FROM dim_fan)+(SELECT COUNT(*) FROM fact_subscriptions)+(SELECT COUNT(*) FROM fact_injuries)");
  $("#dqStats").innerHTML=[["Checks passing",`${pass}/${DQ.length}`,`${Math.round(100*pass/DQ.length)}% pass rate`],["High-severity failures",crit,crit?"alert sent to data owners":"none"],
    ["Rows scanned",rowsChecked.toLocaleString(),"across Gold tables"],["Last run",new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}),"scheduled after every load"]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  $("#dqTable").innerHTML=table(["Check","Table","Dimension","Severity","Failing rows","Result",""],res.map((r,i)=>[esc(r.d[0]),`<code>${r.d[1]}</code>`,r.d[2],
    `<span class="badge ${r.d[4]==="High"?"b-bad":r.d[4]==="Medium"?"b-warn":"b-info"}">${r.d[4]}</span>`,r.fail,
    r.fail===0?`<span class="badge b-cert">Pass</span>`:`<span class="badge b-bad">Fail</span>`,`<button class="ghost" data-dq="${i}">View SQL</button>`]),[4]);
  const cnt={};CATALOG.forEach(c=>cnt[c[0]]=one(`SELECT COUNT(*) FROM ${c[0]}`));
  $("#catalog").innerHTML=table(["Dataset","Layer","Owner","Steward","Class.","SLA","Rows","Status"],CATALOG.map(c=>[`<code>${c[0]}</code>`,c[1],esc(c[2]),esc(c[3]),
    `<span class="badge ${c[4]==="PII"||c[4]==="Restricted"?"b-bad":c[4]==="Confidential"?"b-warn":"b-info"}">${c[4]}</span>`,c[5],cnt[c[0]].toLocaleString(),c[6]?`<span class="badge b-cert">Certified</span>`:`<span class="badge b-warn">Draft</span>`]),[6]);
  const cls=v=>v==="None"?"b-bad":/^(RLS|Masked|Aggregated)/.test(v)?"b-warn":"b-cert";
  $("#access").innerHTML=table(["Role",...ACCESS.sets],ACCESS.roles.map((r,i)=>[`<b>${r}</b>`,...ACCESS.grid[i].map(v=>`<span class="badge ${cls(v)}">${v}</span>`)]));
}
$("#dqTable").addEventListener("click",e=>{const b=e.target.closest("[data-dq]");if(!b)return;const d=DQ[+b.dataset.dq];
  modal(`<h3>${esc(d[0])}</h3><p class="muted">${d[2]} · ${d[1]} · severity ${d[4]}. A non-zero result fails the check.</p><pre>${esc(d[3])}</pre><button class="primary" id="toSql2">Investigate in SQL Lab</button>`);
  $("#toSql2").onclick=()=>{$("#modal").hidden=true;openInSql(SAVED.find(s=>s[0].startsWith("Data quality"))[1])}});
$("#dqRun").onclick=()=>{rendered.gov=true;renderGov()};

/* ---------- adoption ---------- */
function renderAdopt(){
  const P=PAL();
  const w=rows("SELECT week_start, SUM(active_users) u, SUM(CASE WHEN certified=1 THEN active_users ELSE 0 END) cu FROM bi_dashboard_usage GROUP BY 1 ORDER BY 1");
  const s=rows("SELECT week_start, 100.0*SUM(CASE WHEN user_type='Business user' THEN query_count END)/SUM(query_count) pct FROM bi_query_log GROUP BY 1 ORDER BY 1");
  const lab=d=>new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const first=w[0],last=w[w.length-1];
  $("#adStats").innerHTML=[["Weekly active users",last.u,`▲ ${Math.round(100*(last.u-first.u)/first.u)}% since Jan`],["Self-service share",s[s.length-1].pct.toFixed(0)+"%",`from ${s[0].pct.toFixed(0)}% in Jan`],
    ["On certified dashboards",Math.round(100*last.cu/last.u)+"%","of active users"],["Retire candidates",2,"near-zero usage"]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  mkChart("cWau",{type:"line",data:{labels:w.map(r=>lab(r.week_start)),datasets:[{label:"All dashboards",data:w.map(r=>r.u),borderColor:P[0],backgroundColor:P[0]+"22",fill:true,tension:.3},
    {label:"Certified only",data:w.map(r=>r.cu),borderColor:P[1],tension:.3}]},options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},elements:{point:{radius:0}}}});
  mkChart("cSelf",{type:"line",data:{labels:s.map(r=>lab(r.week_start)),datasets:[{label:"Business users' share of queries",data:s.map(r=>r.pct),borderColor:P[3],backgroundColor:P[3]+"22",fill:true,tension:.3}]},
    options:{maintainAspectRatio:false,elements:{point:{radius:0}},scales:{y:{min:0,max:100,ticks:{callback:v=>v+"%"}}},plugins:{legend:{display:false}}}});
  const recent="week_start >= (SELECT date(MAX(week_start),'-49 day') FROM bi_dashboard_usage)";
  const t=q(`SELECT dashboard, department, certified, ROUND(AVG(active_users),0), SUM(views) FROM bi_dashboard_usage WHERE ${recent} GROUP BY 1 ORDER BY 4 DESC`);
  const fmtRow=v=>[`${esc(v[0])}<span class="sub">${esc(v[1])}</span>`,v[2]?`<span class="badge b-cert">Certified</span>`:`<span class="badge b-warn">Uncertified</span>`,v[3],v[4].toLocaleString()];
  $("#tDash").innerHTML=table(["Dashboard","Status","Users / wk","Views"],t.values.slice(0,6).map(fmtRow),[2,3]);
  $("#tRetire").innerHTML=table(["Dashboard","Status","Users / wk","Views"],t.values.filter(v=>v[3]<8).map(fmtRow),[2,3])+
    `<p class="muted">Recommendation: sunset the legacy SSRS ticketing report after moving its last users to Ticketing &amp; Attendance; rework Concessions Aging with Stadium Ops or retire it.</p>`;
}

/* ---------- game-day feed health (odds) ---------- */
function health(){
  const h=$("#oHealth");if(!h)return;
  const age=Math.round((Date.now()-lastTick)/1000),ok=feedOn&&!contractHeld;
  const lag=ok?Math.round(280+Math.random()*520):age*1000;
  const rpm=ok?Math.round(3900+Math.random()*600):0;
  const cell=(label,val,cls)=>`<div class="hcell ${cls}"><span>${label}</span><b>${val}</b></div>`;
  h.innerHTML=cell("Freshness · SLA 60 s",age+" s",age<60?"ok":"bad")+
    cell("Stream lag (Kinesis)",lag>=1000?(lag/1000).toFixed(0)+" s":lag+" ms",lag<2000?"ok":"warn")+
    cell("Records / min",contractHeld?"1,240 held":rpm.toLocaleString(),contractHeld?"bad":rpm?"ok":"warn")+
    cell("Data contract",contractHeld?"Batch quarantined":"odds_feed v2.1 ✓",contractHeld?"bad":"ok");
}

/* ---------- brief: alert + routing ---------- */
function renderAlert(an){
  const a=an.find(x=>x.k==="sv")||an[0];
  if(!a){$("#brSlack").innerHTML='<p class="muted">No alerts this week.</p>';return}
  const t=new Date(AS_OF+"T12:12:00Z");
  $("#brSlack").innerHTML=`<div class="slack"><div class="av">DQ</div><div><div class="who">DataOps Bot <small>APP · Mon 7:02 AM</small></div>
    <div class="msg"><p><b>🚨 Sev 1 · Anomaly – ${esc(a.label)}, Week ${a.week}</b></p>
      <p>${fv(a.val,a.u)} vs expected ${fv(a.exp,a.u)} (${(100*a.rel).toFixed(0)}%, ${a.z.toFixed(1)}σ).</p>
      <p>Ad-server delivery for the same games is normal → likely <b>ratings-feed outage</b>, not lost audience. Ratings-vs-ad-server reconciliation check failing.</p>
      <p class="muted">Certified exec KPI · held from brief totals until resolved · Owner: Media Analytics · Data Eng on-call paged</p></div>
    <div class="acts"><button type="button" id="slAck">Acknowledge</button><button type="button" data-go="gov">Open quality check</button><button type="button" data-go="wh">View pipeline run</button></div></div></div>`;
  $("#slAck").onclick=e=>{e.target.textContent="✅ Acknowledged by on-call · 7:09 AM";e.target.classList.add("done")};
  $("#brSlack").querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>show(b.dataset.go));
  $("#brRoute").innerHTML=table(["Severity","Trigger","Who is notified","Response"],[
    [`<span class="badge b-bad">Sev 1</span>`,`<span class="wrap">Certified exec KPI beyond 4σ, or a High-severity quality failure</span>`,`<span class="wrap">Metric owner + Data Eng on-call (paged) · brief annotated</span>`,"Ack 15 min"],
    [`<span class="badge b-warn">Sev 2</span>`,`<span class="wrap">2.5–4σ, or a Medium-severity failure</span>`,`<span class="wrap">Owner's Slack channel + ticket</span>`,"Same day"],
    [`<span class="badge b-info">Sev 3</span>`,`<span class="wrap">Low severity, informational drift</span>`,`<span class="wrap">Daily digest</span>`,"Next business day"]]);
  $("#brRoute").insertAdjacentHTML("beforeend",`<p class="muted fine">CloudWatch alarm → SNS topic per domain → AWS Chatbot (Slack) and PagerDuty for Sev 1. Every alert links to its runbook, quality check and lineage.</p>`);
  $("#brRoute").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
}

/* ---------- KPI: what-if ---------- */
let adBase=null;
function whatIf(sh){
  adBase=sh;const el=$("#whatIf");
  if(!sh||!sh.length){el.innerHTML='<p class="muted">Ad delivery is not available for this role.</p>';return}
  if(!el.dataset.built){el.dataset.built=1;
    el.innerHTML=`<div class="wi"><label>Streaming CPM change <output id="wiSo">0%</output><input type="range" id="wiS" min="-20" max="20" step="1" value="0"></label>
      <label>Network TV CPM change <output id="wiNo">0%</output><input type="range" id="wiN" min="-20" max="20" step="1" value="0"></label><div class="res" id="wiRes"></div></div>`;
    ["#wiS","#wiN"].forEach(s=>$(s).addEventListener("input",calcWhatIf));}
  calcWhatIf();
}
function calcWhatIf(){
  if(!adBase||!adBase.length)return;
  const ds=+$("#wiS").value,dn=+$("#wiN").value;
  $("#wiSo").textContent=(ds>0?"+":"")+ds+"%";$("#wiNo").textContent=(dn>0?"+":"")+dn+"%";
  const base=adBase.reduce((a,r)=>a+r.sp,0);
  const parts=adBase.map(r=>({ch:r.ch,b:r.sp,n:r.sp*(1+(r.ch==="Streaming"?ds:dn)/100),cpm:1000*r.sp/r.imp*(1+(r.ch==="Streaming"?ds:dn)/100)}));
  const nw=parts.reduce((a,p)=>a+p.n,0),d=nw-base;
  $("#wiRes").innerHTML=`<div class="muted">Ad revenue for the selected period</div><b>${money(nw)}</b> <span class="${d>=0?"up":"down"}">${d>=0?"▲":"▼"} ${money(Math.abs(d))} (${(100*d/base).toFixed(1)}%)</span>
    <div class="muted fine">${parts.map(p=>`${p.ch}: CPM $${p.cpm.toFixed(2)} → ${money(p.n)}`).join(" · ")}</div>`;
}

/* ---------- governance: data contract ---------- */
function contractSteps(){
  const st=[
    ["","Kinesis receives a batch of 1,240 odds updates from the vendor","Ingest · ingest_odds_stream"],
    ["bad","Glue Schema Registry check fails: field <code>spread</code> missing, unknown field <code>point_spread</code>; <code>home_moneyline</code> arrived as text","Contract odds_feed v2.1 · BACKWARD compatibility"],
    ["","Batch quarantined to <code>s3://lake/quarantine/odds/</code> – nothing written to <code>stg_odds</code>","Bad data never reaches Silver or Gold"],
    ["good","Dashboards keep serving the last good lines, clearly labeled as held","Odds board · Broadcast graphics feed · Exec brief"],
    ["","Alert to #data-odds-feed, on-call paged, vendor ticket opened automatically","Runbook: map the renamed field in the contract v2.2, replay quarantined batch"],
  ];
  $("#dcOut").innerHTML=`<ol class="steps">${st.map(([c,t,s],i)=>`<li class="${c}"><i>${c==="bad"?"✕":c==="good"?"✓":i+1}</i><div>${t}<small>${s}</small></div></li>`).join("")}</ol>
    <div class="btnrow mt8"><button class="ghost" type="button" id="dcOdds">See the hold on the Odds page →</button></div>`;
  $("#dcOut").querySelectorAll(".steps li").forEach((li,i)=>setTimeout(()=>li.classList.add("in"),180+i*450));
  $("#dcOdds").onclick=()=>show("odds");
}
$("#dcBreak").onclick=()=>{contractHeld=true;contractSteps();banner()};
$("#dcReset").onclick=()=>{contractHeld=false;lastTick=Date.now();$("#dcOut").innerHTML='<p class="muted">Contract restored – batches are flowing again.</p>';banner();if(rendered.odds)renderOdds()};

/* ---------- fan identity resolution ---------- */
function lev(a,b){if(a===b)return 0;const m=a.length,n=b.length;let p=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function renderFan(){
  let sd=4242;const rnd=()=>{sd|=0;sd=sd+0x6D2B79F5|0;let t=Math.imul(sd^sd>>>15,1|sd);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
  const fans=rows("SELECT fan_id id, contact_email e, state, home_team_id tm, segment seg FROM dim_fan WHERE fan_id NOT IN (5999,6000)");
  const states=[...new Set(fans.map(f=>f.state))];
  const subs=new Set(rows("SELECT DISTINCT fan_id f FROM fact_subscriptions").map(r=>r.f));
  const shop=new Set(rows("SELECT DISTINCT fan_id f FROM fact_merch_orders WHERE fan_id IS NOT NULL").map(r=>r.f));
  const SRC=[["Ticketing","TKT",f=>f.seg==="Season Ticket Holder"||rnd()<.3],["League+","LP",f=>subs.has(f.id)],["Shop","SHP",f=>shop.has(f.id)],["Fantasy app","FAN",f=>f.seg==="Fantasy Player"?rnd()<.9:rnd()<.15]];
  const variant=e=>{const x=rnd(),[l,d]=e.split("@");
    if(x<.55)return [e,"exact"];
    if(x<.70)return [" "+l.charAt(0).toUpperCase()+l.slice(1)+"@"+d.charAt(0).toUpperCase()+d.slice(1),"case/space"];
    if(x<.84)return [l+"+"+["tix","shop","plus"][Math.floor(rnd()*3)]+"@"+d,"plus-tag"];
    if(x<.92)return [l+"@"+["exmaple.com","example.co","examp1e.com"][Math.floor(rnd()*3)],"typo"];
    const [n,c]=l.split(".");return [n+"."+c.slice(0,-1)+"@"+d,"typo"]};
  const recs=[];let k=0;
  fans.forEach(f=>SRC.forEach(([name,pre,inc])=>{if(!inc(f))return;const [e,how]=variant(f.e);
    recs.push({src:name,sid:pre+"-"+(100000+(f.id*37+k++)%900000),e,how,state:rnd()<.1?states[Math.floor(rnd()*states.length)]:f.state,tm:f.tm,truth:f.id})}));
  // pass 1: exact; pass 2: normalized; pass 3: fuzzy within blocks (team + numeric token)
  const exact=new Set(recs.map(r=>r.e)).size;
  const norm=e=>e.trim().toLowerCase().replace(/\+[^@]*@/,"@");
  recs.forEach(r=>r.n=norm(r.e));
  const normN=new Set(recs.map(r=>r.n)).size;
  const parent={};const find=x=>parent[x]===x?x:(parent[x]=find(parent[x]));
  const keys=[...new Set(recs.map(r=>r.n))];keys.forEach(x=>parent[x]=x);
  const info={};recs.forEach(r=>{(info[r.n]=info[r.n]||{tm:r.tm,states:new Set(),recs:[]}).recs.push(r);info[r.n].states.add(r.state)});
  const blocks={};keys.forEach(x=>{const num=(x.match(/\d+/)||[""])[0],b=info[x].tm+"|"+num;(blocks[b]=blocks[b]||[]).push(x)});
  const auto=[],review=[];
  Object.values(blocks).forEach(bk=>{for(let i=0;i<bk.length;i++)for(let j=i+1;j<bk.length;j++){
    const a=bk[i],b=bk[j],d=lev(a,b);if(d>3)continue;
    const sameState=[...info[a].states].some(s=>info[b].states.has(s));
    const conf=Math.min(.99,.55+.2+(sameState?.15:0)+.1*(1-d/3));
    const pair={a:info[a].recs[0],b:info[b].recs[0],d,conf,sameState};
    if(conf>=.9){auto.push(pair);parent[find(a)]=find(b)}else review.push(pair)}});
  const golden=new Set(keys.map(find)).size,truthN=new Set(recs.map(r=>r.truth)).size;
  const correct=auto.filter(p=>p.a.truth===p.b.truth).length;
  const perSys=SRC.map(([n])=>recs.filter(r=>r.src===n).length);
  const multi=(()=>{const c={};recs.forEach(r=>c[r.truth]=(c[r.truth]||new Set()).add(r.src));return Object.values(c).filter(s=>s.size>1).length})();
  $("#fiStats").innerHTML=[["Source records",recs.length.toLocaleString(),SRC.map(([n],i)=>`${n} ${perSys[i].toLocaleString()}`).join(" · ")],
    ["Golden fans",golden.toLocaleString(),`naive count overstates by ${Math.round(100*(recs.length-golden)/golden)}%`],
    ["In 2+ systems",Math.round(100*multi/truthN)+"%","of fans – invisible without matching"],
    ["Needs a steward",review.length.toLocaleString(),`pairs at 0.70–0.90 · ${auto.length.toLocaleString()} fuzzy auto-merges, ${(100*correct/Math.max(1,auto.length)).toFixed(0)}% correct vs synthetic truth`]]
    .map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${esc(c)}</small></div>`).join("");
  const P=PAL();
  mkChart("cFunnel",{type:"bar",data:{labels:["Source records (each system's IDs)","After exact email match","After normalized email","After fuzzy match (auto)","Ground truth (synthetic)"],
    datasets:[{label:"Distinct fans",data:[recs.length,exact,normN,golden,truthN],backgroundColor:[P[5],P[0],P[0],P[1],"#b7c3d3"],borderRadius:4}]},
    options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>" "+c.raw.toLocaleString()+" fans"}}}}});
  const ch=rows(`WITH m AS (SELECT DISTINCT fan_id FROM fact_merch_orders WHERE fan_id IS NOT NULL)
    SELECT CASE WHEN m.fan_id IS NULL THEN 0 ELSE 1 END shopper, COUNT(*) n, 100.0*SUM(CASE WHEN s.end_date IS NOT NULL THEN 1 ELSE 0 END)/COUNT(*) churn
    FROM fact_subscriptions s LEFT JOIN m ON m.fan_id=s.fan_id WHERE s.start_date<'2026-01-01' GROUP BY 1`);
  const cs=ch.find(r=>r.shopper===1),cn=ch.find(r=>r.shopper===0);
  const ltv=rows(`SELECT (SELECT SUM(revenue) FROM fact_merch_orders)+(SELECT SUM(monthly_price*12) FROM fact_subscriptions) v`)[0].v;
  $("#fiImpact").innerHTML=`<ul class="bullets">
    <li><b>Churn:</b> League+ subscribers who also shop churned <b>${cs.churn.toFixed(0)}%</b> vs <b>${cn.churn.toFixed(0)}%</b> for those who don't – a signal that only exists once shop and streaming IDs are joined. It feeds the churn model.</li>
    <li><b>Fan counts:</b> adding up each system's IDs claims ${recs.length.toLocaleString()} fans; there are ${golden.toLocaleString()}. Every per-fan metric built on the naive count is off by ${Math.round(100*(recs.length-golden)/golden)}%.</li>
    <li><b>Value per fan:</b> ${money(ltv/golden)} per golden fan vs ${money(ltv/recs.length)} on the naive count – the number partnerships and sponsorship pricing use.</li>
    <li><b>Marketing:</b> one opt-in and one contact per person – no fan gets the same campaign four times, and opt-outs are honored everywhere.</li></ul>`;
  const fmtR=r=>`<code>${esc(r.e.trim())}</code><span class="sub">${r.src} · ${r.sid} · ${r.state}</span>`;
  const why=p=>`edit distance ${p.d}${p.sameState?" · same state":" · <b>state differs</b>"} · same club`;
  const ex=auto.filter((p,i)=>i%Math.max(1,Math.floor(auto.length/6))===0).slice(0,6);
  $("#fiMatches").innerHTML=table(["Record A","Record B","Evidence","Conf."],ex.map(p=>[fmtR(p.a),fmtR(p.b),`<span class="wrap">${why(p)}</span>`,`<span class="conf">${p.conf.toFixed(2)}</span>`]),[3]);
  $("#fiQueue").innerHTML=table(["Record A","Record B","Evidence","Conf.",""],review.slice(0,6).map((p,i)=>[fmtR(p.a),fmtR(p.b),`<span class="wrap">${why(p)}</span>`,`<span class="conf">${p.conf.toFixed(2)}</span>`,
    `<span class="btnrow" style="margin:0"><button class="ghost" data-fq="ok">Merge</button><button class="ghost" data-fq="no">Keep apart</button></span>`]),[3]);
  $("#fiQueue").onclick=e=>{const b=e.target.closest("[data-fq]");if(!b)return;b.parentElement.innerHTML=b.dataset.fq==="ok"?'<span class="badge b-cert">Merged by steward</span>':'<span class="badge b-info">Kept apart</span>'};
  const dup=rows(`SELECT a.fan_id a, b.fan_id b, a.contact_email e, a.segment sa, b.segment sb, a.signup_date da, b.signup_date dbb FROM dim_fan a JOIN dim_fan b ON a.contact_email=b.contact_email AND a.fan_id<b.fan_id`);
  $("#fiDupes").innerHTML=table(["Golden fan","Duplicate","Shared email","Survivor rule",""],dup.map(d=>[`#${d.a}<span class="sub">${esc(d.sa)} · since ${d.da}</span>`,`#${d.b}<span class="sub">${esc(d.sb)} · since ${d.dbb}</span>`,`<code>${esc(d.e)}</code>`,
    "Keep the oldest ID; repoint orders &amp; subscriptions",`<button class="ghost" data-dm="1">Approve merge</button>`]));
  $("#fiDupes").onclick=e=>{const b=e.target.closest("[data-dm]");if(b)b.outerHTML='<span class="badge b-cert">Merge queued · re-runs uniqueness check</span>'};
  $("#fiDupes").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
  $("#fiMatches").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
  $("#fiQueue").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
}

/* ---------- first 90 days ---------- */
function renderPlan(){
  const name=t=>esc($(`#nav [data-tab="${t}"]`).textContent.replace("★","").trim());
  $("#planCols").innerHTML=PLAN90.map(p=>`<div class="pcol"><div class="when">${p.when}</div><h3>${p.title}</h3><ul>${p.items.map(([t,tab])=>`<li>${esc(t)} <a data-go="${tab}">→ ${name(tab)}</a></li>`).join("")}</ul><div class="deliv"><b>Deliverable:</b> ${esc(p.deliv)}</div></div>`).join("");
  $("#planCols").onclick=e=>{const a=e.target.closest("[data-go]");if(a)show(a.dataset.go)};
  $("#planKpis").innerHTML=PLAN_KPIS.map(([a,b,c])=>`<div class="card"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  $("#planPartners").innerHTML=table(["Partner","Rhythm","What they get"],PLAN_PARTNERS.map(([a,b,c])=>[`<b>${esc(a)}</b>`,`<span class="wrap">${esc(b)}</span>`,`<span class="wrap">${esc(c)}</span>`]));
  $("#planPartners").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
  renderPlanTeam(name);
}
function renderPlanTeam(name){
  const T=PLAN_TEAM,box=([a,b,c],cls="")=>`<div class="tbox ${cls}"><b>${esc(a)}</b><span>${esc(b)}</span><small>${esc(c)}</small></div>`;
  const arrow=`<div class="tarrow" aria-hidden="true"><span>↓ requirements · priorities</span><span>↑ status · demos · risks</span></div>`;
  $("#planTeamBody").innerHTML=`<div class="team">
    <div class="tmain" role="list" aria-label="Who I work with, from the league program owner down to the engineers">
      <div class="tlane k-league" role="listitem"><div class="tl">League</div>${box(T.owner)}</div>${arrow}
      <div class="tstand"><div class="tsl">${esc(T.standup)}</div>
        <div class="tlane k-me" role="listitem"><div class="tl">This role</div>${box(T.me,"me")}</div>${arrow}
        <div class="tlane k-lead" role="listitem"><div class="tl">Nearshore Canada</div>${box(T.lead)}</div>${arrow}
        <div class="tlane k-pods" role="listitem"><div class="tl">Engineers</div><div class="tpods">${T.pods.map(p=>box(p)).join("")}</div></div>
      </div>
    </div>
    <div class="tdep" role="note"><div class="tdl">Dependency</div><div class="tbox dash"><b>${esc(T.dep[0])}</b><span>${esc(T.dep[1])}</span><small>${esc(T.dep[2])}</small><a data-go="${T.dep[3]}">→ ${name(T.dep[3])}</a></div><div class="tdarrow" aria-hidden="true">feeds → this role and the tech lead</div></div>
  </div>
  <div class="grid2 flat mt">
    <div><h3 class="h3s">Rhythm</h3><table class="mini"><tbody>${T.rhythm.map(([a,b,go])=>`<tr><td>${esc(a)}</td><td>${esc(b)}${go?` <a data-go="${go}">→ ${name(go)}</a>`:""}</td></tr>`).join("")}</tbody></table></div>
    <div class="tscale"><h3 class="h3s">From MVP to scale</h3><p>${esc(T.scale)}</p></div>
  </div>`;
  $("#planTeamBody").onclick=e=>{const a=e.target.closest("[data-go]");if(a)show(a.dataset.go)};
}
$("#dcYaml").textContent=DATA_CONTRACT;


/* ---------- International Fan Journey (See / Know / Engage) ---------- */
let iHm="reach",iHmAll=false,iSort={k:"overall",dir:-1};
const cnt=n=>n==null?"–":Math.abs(n)>=1e9?(n/1e9).toFixed(2)+"B":Math.abs(n)>=1e6?(n/1e6).toFixed(2)+"M":Math.abs(n)>=1e4?(n/1e3).toFixed(1)+"K":Math.round(n).toLocaleString();
const IFMT={cnt,money,money2:FMT.money2,pct:FMT.pct,pct2:n=>n==null?"–":n.toFixed(2)+"%",pct3:n=>n==null?"–":n.toFixed(3)+"%"};
const PRES_ORDER={Established:1,Growth:2,Emerging:3};
function intlFilters(){
  const p=INTL_PERIODS[$("#iPeriod").value||"std"],mk=(a,b)=>({start:a,end:b,quarters:intlQuarters(a,b)});
  const f={...mk(p.start,p.end),mkt:+$("#iMarket").value||0,team:+$("#iClub").value||0,label:p.label};
  f.prior={...f,...mk(p.prior.start,p.prior.end)};return f;
}
function spark(vals,color){
  const v=vals.filter(x=>x!=null);if(v.length<2)return `<svg class="spark" viewBox="0 0 100 24" aria-hidden="true"></svg>`;
  const lo=Math.min(...v),sp=(Math.max(...v)-lo)||1,pts=vals.map((x,i)=>(i*100/(vals.length-1)).toFixed(1)+","+(22-20*((x??lo)-lo)/sp).toFixed(1));
  return `<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.join(" ")}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
// change vs the same weeks of 2025: % for counts and money, points for rates
function intlDelta(k,v,p){
  if(v==null)return `<span class="delta muted">no data</span>`;
  if(p==null||p===0)return `<span class="delta muted">${v>0?"new vs 2025":k.id==="attendance"?"no international game":"none in period"}</span>`;
  const isPct=/^pct/.test(k.fmt),ch=isPct?v-p:100*(v-p)/Math.abs(p),good=k.inverse?ch<0:ch>0;
  if(Math.abs(ch)<(isPct&&Math.abs(v)<10?.005:.05))return `<span class="delta muted">flat YoY</span>`;
  return `<span class="delta ${good?"up":"down"}">${ch>0?"▲":"▼"} ${Math.abs(ch).toFixed(isPct&&Math.abs(ch)<1?2:1)}${isPct?" pts":"%"} YoY</span>`;
}
const funnel=f=>rows(intlFunnelSql(f))[0]||{};
function renderIntl(){
  if(!db)return;
  if(!$("#iPeriod").options.length){
    $("#iPeriod").innerHTML=Object.entries(INTL_PERIODS).map(([k,p])=>`<option value="${k}">${esc(p.label)}</option>`).join("");
    $("#iMarket").insertAdjacentHTML("beforeend",rows("SELECT market_id, country, league_presence FROM dim_market ORDER BY market_id").map(m=>`<option value="${m.market_id}">${esc(m.country)} · ${esc(m.league_presence)}</option>`).join(""));
    $("#iClub").insertAdjacentHTML("beforeend",rows("SELECT team_id, team FROM dim_team ORDER BY team").map(t=>`<option value="${t.team_id}">${esc(t.team)}</option>`).join(""));
  }
  const f=intlFilters(),mName=f.mkt?$("#iMarket").selectedOptions[0].textContent.split(" · ")[0]:"all markets",cName=f.team?$("#iClub").selectedOptions[0].textContent:"all clubs";
  $("#iScope").textContent=`Showing ${cName} in ${mName} · ${f.label} · changes vs the same weeks of 2025`;
  const fu=funnel(f),fp=funnel(f.prior);
  renderIntlStages(f,fu,fp);renderIntlFunnel(f,fu,fp);renderIntlMarkets(f);renderIntlMix(f);renderIntlHeat(f);
  if(!$("#iPhases").innerHTML)renderIntlRoadmap();
}
function renderIntlStages(f,fu,fp){
  const conv={know:["See → Know",fu.see_to_know_pct,fp.see_to_know_pct,2],engage:["Know → Engage",fu.know_to_engage_pct,fp.know_to_engage_pct,1]};
  $("#iStages").innerHTML=Object.entries(INTL_STAGES).map(([st,S])=>{
    const color=css("--"+st),c=conv[st];
    const chip=c?`<span>${c[0]}</span> <b>${c[1]==null?"–":c[1].toFixed(c[3])+"%"}</b> ${c[1]!=null&&c[2]?`<span class="${c[1]>=c[2]?"up":"down"}">${c[1]>=c[2]?"▲":"▼"} ${Math.abs(c[1]-c[2]).toFixed(2)} pts</span>`:""}`
      :`<span>Top of funnel</span> <b>${cnt(fu.reach)}</b> <span class="muted">reached</span>`;
    const tiles=INTL_KPIS.filter(k=>k.stage===st).map(k=>{
      const v=one(k.sql(f)),p=one(k.sql(f.prior)),series=q(k.sql(f,true)).values.map(r=>r[1]);
      return `<div class="kpi"><div class="lbl"><span>${esc(k.label)}</span><button class="info" data-ikpi="${k.id}" aria-label="About ${esc(k.label)}">ⓘ</button></div>
        <div class="val">${IFMT[k.fmt](v)}</div>${spark(series,color)}${intlDelta(k,v,p)}</div>`}).join("");
    return `<section class="istage s-${st}" aria-label="${S.name} stage"><h2><i class="sdot"></i>${S.name} <small>${S.sub}</small></h2><p class="sq">${esc(S.q)}</p>
      <div class="iconv">${chip}</div><div class="ikpis">${tiles}</div></section>`}).join("");
}
function renderIntlFunnel(f,fu,fp){
  $("#iFunSub").textContent="bar length on a log scale";
  const steps=[["see","Reached","people reached (gross weekly reach)",fu.reach],["know","Registered fans","new registered / identified fans",fu.registered],["engage","Engaged fans","bought, attended or subscribed",fu.engaged]];
  const mx=Math.log10(Math.max(1,fu.reach||1)),w=v=>v?Math.max(8,100*Math.log10(Math.max(1,v))/mx):0;
  const gap=(lab,v,p,d)=>`<div class="ifc">↓ <b>${v==null?"–":v.toFixed(d)+"%"}</b> ${lab}${v!=null&&p?` · <span class="${v>=p?"up":"down"}">${v>=p?"▲":"▼"} ${Math.abs(v-p).toFixed(2)} pts YoY</span>`:""}</div>`;
  $("#iFunnel").innerHTML=`<div class="ifun">${steps.map(([st,l,sub,v],i)=>`<div class="ifs s-${st}"><div class="top"><span><b class="lab">${l}</b> <span class="muted">${sub}</span></span><b>${cnt(v)}</b></div><div class="fb" style="width:${w(v)}%"></div></div>`+
    (i===0?gap("register (See → Know)",fu.see_to_know_pct,fp.see_to_know_pct,2):i===1?gap("engage (Know → Engage)",fu.know_to_engage_pct,fp.know_to_engage_pct,1):"")).join("")}</div>
    <div class="ifo">Overall: <b>${IFMT.pct3(fu.overall_pct)}</b> of people reached became engaged fans – about 1 in ${fu.overall_pct?Math.round(100/fu.overall_pct).toLocaleString():"–"}.</div>`;
}
function renderIntlMarkets(f){
  const lg=funnel({...f,mkt:0}),mk=Object.fromEntries(rows("SELECT * FROM dim_market").map(m=>[m.market_id,m]));
  const data=rows(intlFunnelSql({...f,mkt:0},["market_id"])).map(r=>{const m=mk[r.market_id],i1=r.see_to_know_pct/lg.see_to_know_pct,i2=r.know_to_engage_pct/lg.know_to_engage_pct;
    return {...r,country:m.country,pres:m.league_presence,po:PRES_ORDER[m.league_presence],weak:i1<=i2?"s2k":"k2e",idx:Math.min(i1,i2)}});
  const K={country:r=>r.country,pres:r=>r.po,reach:r=>r.reach,registered:r=>r.registered,engaged:r=>r.engaged,s2k:r=>r.see_to_know_pct,k2e:r=>r.know_to_engage_pct,overall:r=>r.overall_pct,drop:r=>r.idx};
  const kf=K[iSort.k];data.sort((a,b)=>{const x=kf(a),y=kf(b);return (x<y?-1:x>y?1:0)*iSort.dir});
  const H=[["country","Market"],["pres","Presence"],["reach","Reach",1],["registered","Registered",1],["engaged","Engaged",1],["s2k","See→Know",1],["k2e","Know→Engage",1],["overall","Overall",1],["drop","Biggest drop-off"]];
  const pb=p=>`<span class="badge ${p==="Established"?"b-cert":p==="Growth"?"b-info":"b-warn"}">${p}</span>`;
  const vs=r=>{const g=Math.round(100*(r.idx-1));return `${r.weak==="s2k"?"See→Know":"Know→Engage"}<span class="sub">${g<0?"−"+Math.abs(g)+"% vs league":g>0?"+"+g+"% · both above league":"at league"}</span>`};
  const wk=(r,s)=>r.weak===s?(r.idx<1?"weak":"weakok"):"";
  $("#iMarkets").innerHTML=`<table class="isort"><thead><tr>${H.map(([k,l,n])=>`<th class="${n?"num":""}" aria-sort="${iSort.k===k?(iSort.dir>0?"ascending":"descending"):"none"}"><button type="button" class="sortbtn" data-isort="${k}">${l}${iSort.k===k?(iSort.dir>0?" ▲":" ▼"):""}</button></th>`).join("")}</tr></thead><tbody>${
    data.map(r=>`<tr data-imkt="${r.market_id}" tabindex="0" class="${r.market_id===f.mkt?"sel":""}" aria-label="Filter to ${esc(r.country)}"><td><b>${esc(r.country.replace("United Kingdom","UK"))}</b></td><td>${pb(r.pres)}</td><td class="num">${cnt(r.reach)}</td><td class="num">${cnt(r.registered)}</td><td class="num">${cnt(r.engaged)}</td>
      <td class="num ${wk(r,"s2k")}">${r.see_to_know_pct.toFixed(2)}%</td><td class="num ${wk(r,"k2e")}">${r.know_to_engage_pct.toFixed(1)}%</td><td class="num"><b>${r.overall_pct.toFixed(3)}%</b></td><td>${vs(r)}</td></tr>`).join("")}
    <tr class="tot"><td><b>League benchmark</b></td><td></td><td class="num">${cnt(lg.reach)}</td><td class="num">${cnt(lg.registered)}</td><td class="num">${cnt(lg.engaged)}</td><td class="num">${IFMT.pct2(lg.see_to_know_pct)}</td><td class="num">${lg.know_to_engage_pct==null?"–":lg.know_to_engage_pct.toFixed(1)+"%"}</td><td class="num"><b>${IFMT.pct3(lg.overall_pct)}</b></td><td class="muted">${f.team?"this club, all markets":"all clubs, all markets"}</td></tr></tbody></table>`;
}
function renderIntlMix(f){
  const d=rows(intlMixSql(f)),spend=d.reduce((a,r)=>a+(r.ad_spend||0),0),imps=d.reduce((a,r)=>a+(r.impressions||0),0);
  const tb=t=>`<span class="badge ${t==="Traditional"?"b-warn":t==="Digital"?"b-info":"b-cert"}">${esc(t)}</span>`;
  $("#iMix").innerHTML=table(["Channel","Type","Reach","Impressions","Spend","CPM","Share of spend"],[...d.map(r=>[`<b>${esc(r.channel)}</b>`,tb(r.media_type),r.reach==null?'<span class="muted">modeled</span>':cnt(r.reach),cnt(r.impressions),r.ad_spend?money(r.ad_spend):'<span class="muted">rights partner</span>',
    r.ad_spend?FMT.money2(1000*r.ad_spend/r.impressions):"–",r.ad_spend?`<span class="pbar"><i style="width:${(100*r.ad_spend/spend).toFixed(1)}%"></i></span>${(100*r.ad_spend/spend).toFixed(1)}%`:"–"]),
    [`<b>All channels</b>`,"","",`<b>${cnt(imps)}</b>`,`<b>${money(spend)}</b>`,spend?FMT.money2(1000*spend/d.filter(r=>r.ad_spend).reduce((a,r)=>a+r.impressions,0)):"–",""]],[2,3,4,5]);
}
let homeClubs=null;
function renderIntlHome(f){
  homeClubs=homeClubs||rows(INTL_HOME_SQL);
  $("#iHome").innerHTML=`<span class="hclab"><b class="hc">★</b> Home club – the club fans in each market have adopted as their team · share of surveyed fans naming it:</span>`+homeClubs.map(h=>
    `<button type="button" class="hchip ${f.mkt===h.market_id&&f.team===h.team_id?"on":""}" data-hmk="${h.market_id}" data-hteam="${h.team_id}" aria-label="Filter to ${esc(h.team)} in ${esc(h.country)}"><b>${esc(h.hub_city)}</b> ${esc(h.country.replace("United Kingdom","UK"))} → ${esc(nick(h.team))} <span class="muted">${h.fan_share_pct.toFixed(0)}%</span></button>`).join("");
}
function renderIntlHeat(f){
  renderIntlHome(f);const HC=Object.fromEntries(homeClubs.map(h=>[h.market_id,h.team_id]));
  const M=rows("SELECT market_id, country, iso2 FROM dim_market ORDER BY market_id"),T=rows("SELECT team_id, team FROM dim_team");
  const cells=rows(intlFunnelSql({...f,mkt:0,team:0},["team_id","market_id"])),by={};
  cells.forEach(c=>(by[c.team_id]=by[c.team_id]||{})[c.market_id]=c);
  const st={reach:"see",registered:"know",overall:"engage"}[iHm],color=`var(--${st})`;
  const val=c=>c?(iHm==="overall"?c.overall_pct:c[iHm]):null,fmt=v=>v==null?"–":iHm==="overall"?v.toFixed(3)+"%":cnt(v);
  const tot=t=>{const cs=Object.values(by[t]||{}),s=k=>cs.reduce((a,c)=>a+c[k],0);return iHm==="overall"?100*s("engaged")/s("reach"):s(iHm)};
  const key=t=>f.mkt?val((by[t]||{})[f.mkt]):tot(t);
  let list=T.map(t=>({...t,k:key(t.team_id),tot:tot(t.team_id)})).sort((a,b)=>b.k-a.k);
  if(!iHmAll){const sel=list.find(t=>t.team_id===f.team),top=list.slice(0,10);list=sel&&!top.includes(sel)?[...top,sel]:top}
  const all=cells.map(val).sort((a,b)=>a-b),qt=[.2,.4,.6,.8].map(p=>all[Math.floor(p*(all.length-1))]),SH=[14,32,52,72,90];
  const bin=v=>qt.filter(x=>v>x).length;
  const mName=f.mkt?M.find(m=>m.market_id===f.mkt).country:"all markets";
  $("#iHmSub").textContent=`clubs ranked by ${{reach:"reach",registered:"registered fans",overall:"overall conversion"}[iHm]} in ${mName} · click a cell to filter by club and market`;
  $("#iHeat").innerHTML=`<table class="hm"><thead><tr><th>Club</th><th class="num">All markets</th>${M.map(m=>`<th class="num ${m.market_id===f.mkt?"on":""}" title="${esc(m.country)}">${esc(m.country.replace("United Kingdom","UK"))}</th>`).join("")}</tr></thead><tbody>${
    list.map(t=>`<tr class="${t.team_id===f.team?"on":""}"><td class="club">${esc(t.team)}</td><td class="num">${fmt(t.tot)}</td>${M.map(m=>{const c=(by[t.team_id]||{})[m.market_id],v=val(c),b=bin(v),on=t.team_id===f.team&&m.market_id===f.mkt;
      const home=HC[m.market_id]===t.team_id;
      return `<td class="c num ${SH[b]>=60?"dark":""} ${on?"on":""} ${m.market_id===f.mkt?"col":""}" style="background:color-mix(in srgb, ${color} ${SH[b]}%, var(--surface))" data-iteam="${t.team_id}" data-imk="${m.market_id}" tabindex="0" aria-label="${esc(t.team)} in ${esc(m.country)}: ${fmt(v)}${home?" · home club":""}">${home?'<b class="hc" title="Home club">★</b>':""}${fmt(v)}</td>`}).join("")}</tr>`).join("")}</tbody></table>`;
  const edges=[all[0],...qt,all[all.length-1]];
  $("#iHmLegend").innerHTML=`<span>Quintiles of all 256 club × market cells:</span>`+SH.map((s,i)=>`<span><i style="background:color-mix(in srgb, ${color} ${s}%, var(--surface))"></i>${fmt(edges[i])} – ${fmt(edges[i+1])}</span>`).join("")+`<span><b class="hc">★</b> home club</span>`;
}
function renderIntlRoadmap(){
  const base=one(`SELECT ROUND(100.0 * (SELECT SUM(x.engaged_fans) FROM fact_market_engagement x JOIN dim_market m ON m.market_id = x.market_id WHERE m.league_presence = 'Growth' AND x.week_start BETWEEN '${INTL_PERIODS.std.start}' AND '${INTL_PERIODS.std.end}')
    / (SELECT SUM(x.registered_fans) FROM fact_market_consideration x JOIN dim_market m ON m.market_id = x.market_id WHERE m.league_presence = 'Growth' AND x.week_start BETWEEN '${INTL_PERIODS.std.start}' AND '${INTL_PERIODS.std.end}'), 1)`);
  const live={growthK2E:`Baseline today: <b>${base.toFixed(1)}%</b> Know→Engage in Growth markets (2026 season to date) → target <b>${(base+2).toFixed(1)}%</b>`};
  const chips=s=>s.map(x=>`<span class="schip s-${x}">${INTL_STAGES[x].name}</span>`).join(" ");
  $("#iCal").innerHTML=`<div class="ical" aria-label="2027 football calendar">${INTL_CAL.map(([m,k])=>`<div class="m ${k}" title="${esc(INTL_CAL_KEY[k].join(": "))}">${m}</div>`).join("")}</div>
    <div class="igantt">${INTL_ROADMAP.map(p=>`<div class="grow12"><div class="gb ${p.stages.length===1?"s-"+p.stages[0]:""}" style="grid-column:${p.from}/${p.to+1}" title="${esc(p.t)} · ${esc(p.when)}">${p.n} · ${esc(p.t)}</div></div>`).join("")}</div>
    <div class="ikey">${Object.entries(INTL_CAL_KEY).map(([k,[a,b]])=>`<span><i class="m ${k}"></i><b>${a}</b> ${b}</span>`).join("")}</div>`;
  $("#iPhases").innerHTML=INTL_ROADMAP.map(p=>`<div class="iphase"><span class="pn">${p.n}</span><div class="when">${esc(p.when)}</div><h3>${esc(p.t)}</h3><div>${chips(p.stages)}</div><p>${esc(p.d)}</p>
    <dl><dt>Owner</dt><dd>${esc(p.owner)}</dd><dt>Depends on</dt><dd>${esc(p.deps)}</dd><dt>Key risk</dt><dd class="down">⚠ ${esc(p.risk)}</dd><dt>Success metric</dt><dd><b>${esc(p.metric)}</b>${p.live?`<span class="sub">${live[p.live]}</span>`:""}</dd></dl></div>`).join("");
  $("#iDeps").innerHTML=table(["Initiative","Depends on","Owner","Risk","Mitigation"],INTL_DEPS.map(d=>[esc(d[0]),esc(d[1]),esc(d[2]),`<span class="badge ${d[3]==="High"?"b-bad":d[3]==="Medium"?"b-warn":"b-cert"}">${d[3]}</span>`,esc(d[4])]));
  $("#iDeps").querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal");
}
function intlInfo(id){
  const k=INTL_KPIS.find(x=>x.id===id),f=intlFilters(),sql=k.sql(f),S=INTL_STAGES[k.stage];
  modal(`<h3>${esc(k.label)} <span class="badge b-warn">Draft · certified in phase 3</span></h3><p>${esc(k.def)}</p>
    <dl class="kv"><dt>Stage</dt><dd>${S.name} · ${S.sub}</dd><dt>Business owner</dt><dd>${esc(k.owner[0])}</dd><dt>Data steward</dt><dd>${esc(k.owner[1])}</dd><dt>Refresh</dt><dd>${esc(k.owner[2])}</dd><dt>Source</dt><dd><code>${esc(k.src)}</code></dd>${k.inverse?"<dt>Direction</dt><dd>Lower is better</dd>":""}</dl>
    <pre>${esc(sql)}</pre><button class="primary" id="toSqlI">Open in SQL Lab</button>`);
  $("#toSqlI").onclick=()=>{$("#modal").hidden=true;openInSql(sql)};
}
["#iMarket","#iClub","#iPeriod"].forEach(s=>$(s).addEventListener("change",renderIntl));
document.querySelectorAll("[data-iorder]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("[data-iorder]").forEach(x=>x.classList.toggle("on",x===b));$("#iStages").classList.toggle("see-first",b.dataset.iorder==="see")});
document.querySelectorAll("[data-ihm]").forEach(b=>b.onclick=()=>{iHm=b.dataset.ihm;document.querySelectorAll("[data-ihm]").forEach(x=>x.classList.toggle("on",x===b));if(db)renderIntlHeat(intlFilters())});
$("#iHmAll").onclick=()=>{iHmAll=!iHmAll;$("#iHmAll").textContent=iHmAll?"Show top 10":"Show all 32 clubs";if(db)renderIntlHeat(intlFilters())};
$("#iStages").addEventListener("click",e=>{const b=e.target.closest("[data-ikpi]");if(b)intlInfo(b.dataset.ikpi)});
const setIntl=(mkt,team)=>{if(mkt!=null)$("#iMarket").value=mkt;if(team!=null)$("#iClub").value=team;renderIntl()};
function intlPick(e){
  const s=e.target.closest("[data-isort]");if(s){const k=s.dataset.isort;iSort=iSort.k===k?{k,dir:-iSort.dir}:{k,dir:["country","pres"].includes(k)?1:-1};renderIntlMarkets(intlFilters());return}
  const r=e.target.closest("[data-imkt]");if(r){const m=r.dataset.imkt;setIntl($("#iMarket").value===m?"":m,null);return}
  const c=e.target.closest("[data-iteam]");if(c){const on=$("#iMarket").value===c.dataset.imk&&$("#iClub").value===c.dataset.iteam;setIntl(on?"":c.dataset.imk,on?"":c.dataset.iteam)}
}
$("#iHome").addEventListener("click",e=>{const b=e.target.closest("[data-hmk]");if(!b)return;const on=$("#iMarket").value===b.dataset.hmk&&$("#iClub").value===b.dataset.hteam;setIntl(on?"":b.dataset.hmk,on?"":b.dataset.hteam)});
["#iMarkets","#iHeat"].forEach(s=>{$(s).addEventListener("click",intlPick);$(s).addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-imkt],[data-iteam]")){e.preventDefault();intlPick(e)}})});

/* share link: copies <origin>/international (preview deploys copy their own origin) */
let copyT=0;
function copyMsg(t){$("#iCopyMsg").textContent=t;clearTimeout(copyT);copyT=setTimeout(()=>$("#iCopyMsg").textContent="",t.length>12?8000:2000)}
function copyFallback(text){
  const ta=document.createElement("textarea");ta.value=text;ta.setAttribute("readonly","");ta.style.cssText="position:fixed;top:0;left:0;opacity:0";
  document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(e){}ta.remove();return ok;
}
$("#iCopyLink").onclick=()=>{
  const url=location.origin+"/international";
  const done=()=>copyMsg("Copied"),fail=()=>copyMsg(copyFallback(url)?"Copied":"Copy this link: "+url);
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(url).then(done,fail);else fail();
};

/* ---------- Survey ↔ activation reconciliation ---------- */
function renderRecon(){
  const sm=rows(RECON_SUMMARY_SQL)[0],tot=sm.survey_rows,gap=sm.unmatched,pct=100*gap/tot,P=PAL();
  const causes=rows(RECON_CAUSE_SQL),bySv=rows(RECON_BY_SURVEY_SQL),og=rows(RECON_ONGOING_SQL)[0],ogPct=100*og.still_missing/og.settled_rows;
  const chk=RECON_CHECKS.map(c=>({c,v:one(c.sql)})),C=RECON_CAUSES,top=causes[0],TC=C[top.cause];
  const sv=bySv.filter(r=>r.top_cause===top.cause&&r.unmatched).sort((a,b)=>b.unmatched-a.unmatched).slice(0,2).map(r=>r.event_name);
  $("#rcStats").innerHTML=[["Survey responses",tot.toLocaleString(),"fact_fan_survey · 2026 to date"],["Matched in activation",(tot-gap).toLocaleString(),`1:1 on hashed email + event name`],
    ["Missing from activation",gap.toLocaleString(),"survey rows with no activation row"],["% missing",pct.toFixed(1)+"%",`activation loaded through ${sm.loaded_through} UTC`]]
    .map(([a,b,c],i)=>`<div class="card ${i>=2?"bad":""}"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  $("#rcSentence").innerHTML=`<b>${pct.toFixed(1)}% of survey responses are missing from activation</b> (${gap.toLocaleString()} of ${tot.toLocaleString()}); <b>${Math.round(top.share_of_gap_pct)}% of those come from ${esc(TC.label)}</b>${sv.length?` – mostly the ${sv.map(esc).join(" and ")} survey${sv.length>1?"s":""}`:""}. <b>Fix:</b> ${esc(TC.fix)}. <b>Ongoing check:</b> ${esc(RECON_ONGOING.text)}.`;
  $("#rcOngoing").innerHTML=`<span class="badge ${ogPct>RECON_ONGOING.threshold?"b-bad":"b-cert"}">${ogPct>RECON_ONGOING.threshold?"Would alert today":"Passing"}</span><span>Ongoing check run now: ${og.still_missing.toLocaleString()} of ${og.settled_rows.toLocaleString()} responses older than 48 hours are still missing (<b>${ogPct.toFixed(1)}%</b> vs the ${RECON_ONGOING.threshold}% threshold). Timing rows drop out once they load, so it only alerts on real loss.</span>
    <button class="ghost" type="button" data-rcsql="ongoing">View SQL</button>`;
  const res=(c,v)=>c.id==="gap"?`<span class="badge b-bad">${pct.toFixed(1)}% missing</span>`:c.pass?`<span class="badge ${v===0?"b-cert":"b-bad"}">${v===0?"Pass":"Fail"}</span>`:c.info?`<span class="badge b-warn">${v?"Info · not a cause":"Pass"}</span>`
    :!v?`<span class="badge b-cert">Pass</span>`:c.cause==="timing"?`<span class="badge b-warn">Self-heals next load</span>`:c.cause==="unexplained"?`<span class="badge b-warn">Escalate</span>`:`<span class="badge b-bad">Explains ${(100*v/gap).toFixed(0)}%</span>`;
  $("#rcChecks").innerHTML=table(["#","Check","Rows","Share of gap","Result",""],chk.map(({c,v},i)=>[i+1,`<b>${esc(c.t)}</b><span class="sub wrap">${esc(c.d)}</span>`,v.toLocaleString(),
    c.cause?(100*v/gap).toFixed(1)+"%":c.id==="gap"?"100%":"–",res(c,v),`<button class="ghost" type="button" data-rcsql="${i}">View SQL</button>`]),[0,2,3]);
  $("#rcChecks").querySelectorAll("td:nth-child(2)").forEach(td=>td.style.whiteSpace="normal");
  const col=c=>c==="unexplained"?P[5]:c==="timing"?P[2]:c===top.cause?P[0]:P[1];
  mkChart("cRecon",{type:"bar",data:{labels:causes.map(c=>C[c.cause].short),datasets:[{label:"Share of the gap (%)",data:causes.map(c=>c.share_of_gap_pct),backgroundColor:causes.map(c=>col(c.cause)),borderRadius:4}]},
    options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>` ${causes[x.dataIndex].rows} rows · ${x.raw}% of the gap`}}},scales:{x:{title:{display:true,text:"% of missing survey responses"},beginAtZero:true}}}});
  $("#rcPlan").innerHTML=table(["Cause","Rows","Fix","Owner"],causes.map(c=>[`<b>${esc(C[c.cause].short)}</b><span class="sub">${c.share_of_gap_pct}% of the gap</span>`,c.rows,`<span class="wrap">${esc(C[c.cause].fix[0].toUpperCase()+C[c.cause].fix.slice(1))}</span>`,`<span class="wrap">${esc(C[c.cause].owner)}</span>`]),[1]);
  $("#rcBySurvey").innerHTML=table(["Survey","Responses","Missing","% missing","Top cause"],bySv.map(r=>[`<b>${esc(r.event_name)}</b><span class="sub">${esc(r.survey_id)}</span>`,r.responses.toLocaleString(),r.unmatched,
    `<span class="${r.missing_pct>pct?"down":""}">${r.missing_pct.toFixed(1)}%</span>`,r.top_cause?esc(C[r.top_cause].short):"–"]),[1,2,3]);
  ["#rcPlan","#rcBySurvey"].forEach(s=>$(s).querySelectorAll("td").forEach(td=>td.style.whiteSpace="normal"));
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-rcsql]");if(!b)return;
  const c=b.dataset.rcsql==="ongoing"?{t:"Ongoing reconciliation check",d:RECON_ONGOING.text,sql:RECON_ONGOING_SQL}:RECON_CHECKS[+b.dataset.rcsql];
  modal(`<h3>${esc(c.t)}</h3><p class="muted">${esc(c.d)} Hashes only – the query never touches an email.</p><pre>${esc(c.sql)}</pre><button class="primary" id="toSqlR">Open in SQL Lab</button>`);
  $("#toSqlR").onclick=()=>{$("#modal").hidden=true;openInSql(c.sql)}});
$("#rcRun").onclick=()=>{if(db){rendered.recon=true;renderRecon()}};

const RENDER={recon:renderRecon,intl:renderIntl,fan:renderFan,plan:renderPlan,overview:renderOverview,kpi:renderKpi,odds:renderOdds,wh:renderWh,brief:renderBrief,ask:renderAsk,churn:renderChurn,erd:()=>renderErd("star"),sql:renderSql,roadmap:renderRoadmap,gov:renderGov,adopt:renderAdopt};

/* ---------- boot ---------- */
{const t=tabFromUrl();show(t,FRIENDLY_PATH.test(location.pathname)||(location.hash&&location.hash!=="#"+SLUG[t])?"replace":"none")}
initSqlJs({locateFile:f=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}`}).then(SQL=>{
  const t0=performance.now();db=buildWarehouse(SQL);
  const n=one("SELECT COUNT(*) FROM dim_game");
  $("#dbstatus").textContent=`Warehouse ready · ${n.toLocaleString()} games · ${Math.round(performance.now()-t0)} ms`;$("#dbstatus").classList.add("ok");
  rendered[current]=true;RENDER[current]();
}).catch(e=>{$("#dbstatus").textContent="Warehouse failed to load – check your connection";console.error(e)});
})();
