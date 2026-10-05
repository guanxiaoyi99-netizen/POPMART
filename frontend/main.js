const API = '';
let chartInstances = {};
const loadedTabs = { overview: true };

// Memphis color scheme (validated: CVD-safe categorical palette)
const MEMPHIS = ['#E94F7F', '#E88900', '#26A69A', '#7C3AED', '#FF6B5E', '#3D7BFF'];
// Status colors: positive / neutral / negative
const COL_POS = '#26A69A';
const COL_NEU = '#E88900';
const COL_NEG = '#FF6B5E';
echarts.registerTheme('memphis', { color: MEMPHIS });

function switchTab (tab) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    document.getElementById(tab).classList.add('active');

    document.querySelectorAll('.nav button').
        forEach(b => {b.classList.remove('active');
            if(b.getAttribute('onclick').includes("'" + tab + "'")){
                b.classList.add('active');
            }
        });

    if(!loadedTabs[tab]){
        loadedTabs[tab] = true;

        const loaders = { ip: loadIP, sentiment: loadSentiment, platform: loadPlatform, user: loadUser, hotsearch: loadHotsearch, comments: loadComments };
        if(loaders[tab]){
            loaders[tab]();
        }
    }

    Object.values(chartInstances).forEach(c => c.resize());

}

function initChart(id){
    if(chartInstances[id]){
        chartInstances[id].dispose()
    }

    chartInstances[id] = echarts.init(document.getElementById(id), 'memphis')

    return chartInstances[id]
}

// Real data is sparse by nature: show an honest empty state instead of a blank chart.
function showEmpty(chartId, msg) {
    const el = document.getElementById(chartId);
    if (el) el.innerHTML = '<div class="empty-state">' + (msg || 'No real data available yet') + '</div>';
}

async function fetchJSON(path){
    try {
        const res = await fetch(API + path)

        if(!res.ok){
            throw new Error('Request failed' + res.status);
        }

        return await res.json()

    } catch (e) {
        console.error('Data loading failed: ', path, e);
        return null
    }
}


function formatNum(n) { return Number(n).toLocaleString('en-US'); }

function formatCompact(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
}

function escapeHTML(str){
    var div = document.createElement('div')
    div.appendChild(document.createTextNode(str));

    return div.innerHTML;
}


// ===== Overall Overview =====
async function loadOverview() {
    const [ipData, sData, pData, commentsData] = await Promise.all([
        fetchJSON('/api/ip-performance'),
        fetchJSON('/api/sentiment'),
        fetchJSON('/api/platform-distribution'),
        fetchJSON('/api/comments')
    ]);

    if(!ipData || !sData || !pData || !commentsData) return;

    // KPIs - all real: Weibo hot values, Bilibili comments, snownlp sentiment
    var totalSearch = ipData.reduce((sum, d) => sum + Number(d.weibo_hot_value_sum || 0), 0);

    var totalComments = commentsData.length;

    var positiveCount = commentsData.filter(c => c.sentiment === 'positive').length;

    var avgSentiment = totalComments > 0 ? (positiveCount / totalComments * 100).toFixed(1) : 0;

    const ipCandidates = ipData.filter(d => d.ip_name !== 'Brand-level' && d.ip_name !== 'Other IPs');
    var topIp = ipCandidates.length
        ? ipCandidates.slice().sort((a, b) => Number(b.weibo_hot_value_sum) - Number(a.weibo_hot_value_sum))[0].ip_name
        : '--';

    document.getElementById('kpi-total-search').textContent = formatCompact(totalSearch);
    document.getElementById('kpi-total-comments').textContent = formatNum(totalComments);
    document.getElementById('kpi-positive-rate').textContent = avgSentiment + '%';
    document.getElementById('kpi-top-ip').textContent = topIp;

    // IP 2024 revenue ranking (annual report; 'Brand-level' total excluded to avoid double counting)
    const ipRows = ipData.filter(d => d.ip_name !== 'Brand-level');
    if (!ipRows.length) {
        showEmpty('chart-ip-bar');
    } else {
        var sorted = ipRows.slice().sort((a, b) => Number(b.revenue_100m_yuan) - Number(a.revenue_100m_yuan));
        var c1 = initChart('chart-ip-bar')
        c1.setOption({
            tooltip: { trigger: 'axis', valueFormatter: v => v + ' ¥100M' },
            grid: { left: 80, right: 30, bottom: 40, top: 20 },
            xAxis: { type: 'category', data: sorted.map(d => d.ip_name), axisLabel: { rotate: 20 } },
            yAxis: { type: 'value', name: '¥100M' },
            series: [{
                type: 'bar', data: sorted.map(d => Number(d.revenue_100m_yuan)),
                itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#E94F7F' }, { offset: 1, color: '#7C3AED' }]) },
                barWidth: '50%'
            }]
        });
    }

    // Comment sentiment distribution (real Bilibili comments, snownlp labels)
    if (!sData.length) {
        showEmpty('chart-sentiment-pie', 'No real comment data yet');
    } else {
        var totalPos = 0, totalNeg = 0, totalNeu = 0;
        sData.forEach(s => { totalPos += Number(s.positive_count); totalNeg += Number(s.negative_count); totalNeu += Number(s.neutral_count); });
        var c2 = initChart('chart-sentiment-pie');
        c2.setOption({
            tooltip: { trigger: 'item' },
            legend: { bottom: 10 },
            series: [{
                type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
                data: [
                    { value: totalPos, name: 'Positive', itemStyle: { color: COL_POS } },
                    { value: totalNeu, name: 'Neutral', itemStyle: { color: COL_NEU } },
                    { value: totalNeg, name: 'Negative', itemStyle: { color: COL_NEG } }
                ],
                label: { formatter: '{b}: {d}%' }
            }]
        });
    }

    // Hot search entries by platform (real archive presence counts)
    if (!pData.length) {
        showEmpty('chart-platform-bar');
    } else {
        var c3 = initChart('chart-platform-bar');
        c3.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 80, right: 30, bottom:40, top: 20 },
            xAxis: { type: 'category', data: pData.map(d => d.platform), axisLabel: { rotate: 20 } },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: pData.map(d => Number(d.hotsearch_entry_count)), itemStyle: { color: '#3D7BFF' }, barWidth: '40%' }]
        });
    }
}

// ===== IP Analysis (2024 annual report + real Weibo hot values) =====
async function loadIP() {
    const data = await fetchJSON('/api/ip-performance')
    if(!data) return;

    const rows = data.filter(d => d.ip_name !== 'Brand-level');
    if (!rows.length) {
        showEmpty('chart-ip-scatter'); showEmpty('chart-ip-comments-bar');
        showEmpty('chart-ip-sentiment-radar'); showEmpty('chart-ip-heatmap');
        return;
    }

    const sorted = rows.slice().sort((a, b) => Number(b.revenue_100m_yuan) - Number(a.revenue_100m_yuan));

    const maxRevenue = Math.max(...rows.map(d => Number(d.revenue_100m_yuan))) || 1;
    const maxHot = Math.max(...rows.map(d => Number(d.weibo_hot_value_sum))) || 1;
    const maxComments = Math.max(...rows.map(d => Number(d.comment_count))) || 1;
    const maxGrowth = Math.max(...rows.map(d => Number(d.revenue_yoy_pct))) || 1;

    // Scatter: revenue vs YoY growth (real annual report figures)
    const scat = sorted.filter(d => Number(d.revenue_yoy_pct) > 0);
    if (!scat.length) {
        showEmpty('chart-ip-scatter');
    } else {
        var c1 = initChart('chart-ip-scatter');
        c1.setOption({
            tooltip: { trigger: 'item', formatter: p => p.data[2] + '<br>YoY Growth: ' + p.data[0] + '%<br>Revenue: ' + p.data[1] + ' ¥100M' },
            grid: { left: 60, right: 30, bottom: 40, top: 20 },
            xAxis: { name: 'YoY Growth (%)', type: 'value', scale: true },
            yAxis: { name: 'Revenue (¥100M)', type: 'value', scale: true },
            series: [{
                type: 'scatter', symbolSize: d => Math.max(Number(d[1]) * 1.2, 14),
                data: scat.map(d => [Number(d.revenue_yoy_pct), Number(d.revenue_100m_yuan), d.ip_name]),
                label: { show: true, formatter: p => p.data[2], position: 'top', fontSize: 11 }
            }]
        });
    }

    // Weibo hot value by IP (real archive aggregation)
    if (maxHot <= 0) {
        showEmpty('chart-ip-comments-bar', 'No Weibo hot search entries for these IPs in this window');
    } else {
        var c2 = initChart('chart-ip-comments-bar')
        c2.setOption({
            tooltip: { trigger: 'axis', valueFormatter: v => formatNum(v) },
            grid: { left: 80, right: 30, bottom: 40, top: 20 },
            xAxis: { type: 'category', data: sorted.map(d => d.ip_name), axisLabel: { rotate: 20 } },
            yAxis: { type: 'value', axisLabel: { formatter: v => formatCompact(v) } },
            series: [{ type: 'bar', data: sorted.map(d => Number(d.weibo_hot_value_sum)), itemStyle: { color: '#E94F7F' }, barWidth: '50%' }]
        });
    }

    // Radar: top-5 IPs by revenue, all real metrics normalized
    const top5 = sorted.slice(0, 5)
    const radarIndicator = [
        { name: 'Revenue', max: 1 },
        { name: 'Weibo Hot Value', max: 1 },
        { name: 'Comments', max: 1 },
        { name: 'Sentiment', max: 1 },
        { name: 'YoY Growth', max: 1 }
    ];
    const radarData = top5.map(d => ({
        value: [
            Number(d.revenue_100m_yuan) / maxRevenue,
            Number(d.weibo_hot_value_sum) / maxHot,
            Number(d.comment_count) / maxComments,
            Number(d.avg_sentiment_score) || 0,
            Number(d.revenue_yoy_pct) / maxGrowth
        ],
        name: d.ip_name
    }));
    var c3 = initChart('chart-ip-sentiment-radar')
    c3.setOption({
        tooltip: {},
        legend: { bottom: 0, data: top5.map(d => d.ip_name) },
        radar: { indicator: radarIndicator, shape: 'polygon', radius: '60%' },
        series: [{ type: 'radar', data: radarData }]
    });

    // Heatmap: normalized across real metrics (dynamic per-metric max)
    const dims = ['Revenue', 'Weibo Hot Value', 'Comments', 'Sentiment', 'YoY Growth'];
    const rawByIp = {};
    const heatData = [];
    sorted.forEach((ip, yi) => {
        const raws = [
            Number(ip.revenue_100m_yuan), Number(ip.weibo_hot_value_sum),
            Number(ip.comment_count), Number(ip.avg_sentiment_score) || 0,
            Number(ip.revenue_yoy_pct)
        ];
        rawByIp[ip.ip_name] = raws;
        const vals = [
            raws[0] / maxRevenue, raws[1] / maxHot, raws[2] / maxComments,
            raws[3], raws[4] / maxGrowth
        ];
        vals.forEach((v, xi) => heatData.push([xi, yi, Number(v).toFixed(2)]));
    });
    var c4 = initChart('chart-ip-heatmap');
    c4.setOption({
        tooltip: { formatter: p => {
            const ip = sorted[p.data[1]].ip_name;
            const raws = rawByIp[ip];
            return ip + ' - ' + dims[p.data[0]] + ': ' + raws[p.data[0]];
        } },
        grid: { left: 100, right: 80, bottom: 30, top: 10 },
        xAxis: { type: 'category', data: dims, splitArea: { show: true } },
        yAxis: { type: 'category', data: sorted.map(d => d.ip_name), splitArea: { show: true } },
        visualMap: { min: 0, max: 1, calculable: true, orient: 'vertical', right: 0, top: 'center', inRange: { color: ['#FFF6EA', '#E94F7F', '#7C3AED'] }, outOfRange: { color: '#F2E9E4' } },
        series: [{ type: 'heatmap', data: heatData, label: { show: true } }]
    });

}

async function loadSentiment() {
    const data = await fetchJSON('/api/sentiment')
    if(!data) return;

    if (!data.length) {
        showEmpty('chart-sentiment-stacked', 'No real comment data yet');
        showEmpty('chart-sentiment-likes');
        showEmpty('chart-sentiment-heatmap');
        return;
    }

    const sorted = data.slice().sort((a, b) => Number(b.positive_pct) - Number(a.positive_pct));

    var c1 = initChart('chart-sentiment-stacked')
    c1.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, data: ['Positive', 'Neutral', 'Negative'] },
        grid: { left: 100, right: 30, bottom: 40, top: 20 },
        yAxis: { type: 'category', data: sorted.map(d => d.category) },
        xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
        series: [
            { name: 'Positive', type: 'bar', stack: 'total', data: sorted.map(d => Number(d.positive_pct)), itemStyle: { color: COL_POS, borderWidth: 2, borderColor: '#fff' } },
            { name: 'Neutral', type: 'bar', stack: 'total', data: sorted.map(d => Number(d.neutral_pct)), itemStyle: { color: COL_NEU, borderWidth: 2, borderColor: '#fff' } },
            { name: 'Negative', type: 'bar', stack: 'total', data: sorted.map(d => Number(d.negative_pct)), itemStyle: { color: COL_NEG, borderWidth: 2, borderColor: '#fff' } }
        ]
    });

    // Comparison of positive/negative likes (real avg likes per category)
    var c2 = initChart('chart-sentiment-likes');
    c2.setOption({
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0, data: ['Avg Likes (Positive)', 'Avg Likes (Negative)'] },
        grid: { left: 100, right: 30, bottom: 40, top: 20 },
        yAxis: { type: 'category', data: sorted.map(d => d.category) },
        xAxis: { type: 'value' },
        series: [
            { name: 'Avg Likes (Positive)', type: 'bar', data: sorted.map(d => Number(d.avg_likes_positive)), itemStyle: { color: COL_POS } },
            { name: 'Avg Likes (Negative)', type: 'bar', data: sorted.map(d => Number(d.avg_likes_negative)), itemStyle: { color: COL_NEG } }
        ]
    });

    // Sentiment heatmap by category
    var c3 = initChart('chart-sentiment-heatmap');
    const cats = sorted.map(d => d.category);
    const hData = [];
    sorted.forEach((s, yi) => {
        hData.push([0, yi, Number(s.positive_pct).toFixed(1)]);
        hData.push([1, yi, Number(s.neutral_pct).toFixed(1)]);
        hData.push([2, yi, Number(s.negative_pct).toFixed(1)]);
    });
    c3.setOption({
        tooltip: { formatter: p => cats[p.data[1]] + ' - ' + ['Positive', 'Neutral', 'Negative'][p.data[0]] + ': ' + p.data[2] + '%' },
        grid: { left: 100, right: 80, bottom: 30, top: 10 },
        xAxis: { type: 'category', data: ['Positive', 'Neutral', 'Negative'] },
        yAxis: { type: 'category', data: cats },
        visualMap: { min: 0, max: 100, calculable: true, orient: 'vertical', right: 0, top: 'center', inRange: { color: ['#FFF6EA', '#FF6B5E', '#7C3AED'] }, outOfRange: { color: '#F2E9E4' } },
        series: [{ type: 'heatmap', data: hData, label: { show: true, formatter: p => p.data[2] + '%' } }]
    });

}

async function loadPlatform() {
    const [data, hsData, commentsData] = await Promise.all([
        fetchJSON('/api/platform-distribution'),
        fetchJSON('/api/hotsearch'),
        fetchJSON('/api/comments')
    ]);
    if (!data || !hsData || !commentsData) return;

    // Hot search entries & Bilibili engagement by platform (real)
    if (!data.length) {
        showEmpty('chart-platform-compare'); showEmpty('chart-platform-pie');
    } else {
        var c1 = initChart('chart-platform-compare');
        c1.setOption({
            tooltip: { trigger: 'axis' },
            legend: { bottom: 0, data: ['Hot Search Entries', 'Avg Likes (estimated)', 'Avg Replies (estimated)'] },
            grid: { left: 80, right: 30, bottom: 40, top: 20 },
            xAxis: { type: 'category', data: data.map(d => d.platform), axisLabel: { rotate: 20 } },
            yAxis: { type: 'value' },
            series: [
                { name: 'Hot Search Entries', type: 'bar', data: data.map(d => Number(d.hotsearch_entry_count)), itemStyle: { color: '#E94F7F' } },
                { name: 'Avg Likes (estimated)', type: 'bar', data: data.map(d => Number(d.avg_likes)), itemStyle: { color: COL_POS } },
                { name: 'Avg Replies (estimated)', type: 'bar', data: data.map(d => Number(d.avg_replies)), itemStyle: { color: '#3D7BFF' } }
            ]
        });

        // Entry share pie (real archive presence; zero-entry platforms hidden)
        var c2 = initChart('chart-platform-pie');
        c2.setOption({
            tooltip: { trigger: 'item' },
            legend: { bottom: 10 },
            series: [{
                type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
                data: data.filter(d => Number(d.hotsearch_entry_count) > 0)
                    .map(d => ({ value: Number(d.hotsearch_entry_count), name: d.platform })),
                label: { formatter: '{b}\n{d}%' }
            }]
        });
    }

    // Month x platform hot search entry heatmap (real, from /api/hotsearch)
    if (!hsData.length) {
        showEmpty('chart-platform-heatmap');
    } else {
        const months = [...new Set(hsData.map(d => d.date.slice(0, 7)))].sort();
        const plats = [...new Set(hsData.map(d => d.platform))];
        const counts = {};
        hsData.forEach(d => {
            const k = d.platform + '|' + d.date.slice(0, 7);
            counts[k] = (counts[k] || 0) + 1;
        });
        const heatData = [];
        plats.forEach((p, yi) => {
            months.forEach((m, xi) => {
                const v = counts[p + '|' + m] || 0;
                // push every cell (incl. 0) so the grid has no blank holes
                heatData.push([xi, yi, v]);
            });
        });
        const maxCount = Math.max(1, ...heatData.map(d => d[2]));
        var c3 = initChart('chart-platform-heatmap');
        c3.setOption({
            tooltip: { formatter: p => plats[p.data[1]] + ' ' + months[p.data[0]] + ': ' + p.data[2] + ' entries' },
            grid: { left: 80, right: 80, bottom: 60, top: 10 },
            xAxis: { type: 'category', data: months, axisLabel: { rotate: 45 } },
            yAxis: { type: 'category', data: plats },
            visualMap: { min: 0, max: maxCount, calculable: true, orient: 'vertical', right: 0, top: 'center', inRange: { color: ['#FFF6EA', '#E94F7F', '#7C3AED'] }, outOfRange: { color: '#F2E9E4' } },
            series: [{ type: 'heatmap', data: heatData, label: { show: false } }]
        });
    }

    // Bilibili comment activity by hour (real comment timestamps)
    if (!commentsData.length) {
        showEmpty('chart-platform-hours', 'No real comment data yet');
    } else {
        const hours = Array(24).fill(0);
        commentsData.forEach(c => {
            const d = new Date(c.timestamp.replace(' ', 'T'));
            if (!isNaN(d.getTime())) hours[d.getHours()]++;
        });
        if (hours.every(v => v === 0)) {
            showEmpty('chart-platform-hours', 'No real comment data yet');
        } else {
            var c4 = initChart('chart-platform-hours');
            c4.setOption({
                tooltip: { trigger: 'axis' },
                grid: { left: 60, right: 30, bottom: 40, top: 20 },
                xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => i + ':00'), axisLabel: { rotate: 45, fontSize: 10 } },
                yAxis: { type: 'value', name: 'Comments' },
                series: [{ type: 'bar', data: hours, itemStyle: { color: '#7C3AED' }, barWidth: '70%' }]
            });
        }
    }

}

// ===== User Profile (Bernstein survey + official disclosures) =====
async function loadUser() {
    const data = await fetchJSON('/api/demographics');
    if (!data) return;

    const byMetric = {};
    data.forEach(d => { (byMetric[d.metric] = byMetric[d.metric] || []).push(d); });
    const getRows = m => byMetric[m] || [];

    // KPI tiles (official disclosures)
    const rep = getRows('repurchase')[0];
    document.getElementById('kpi-user-repurchase').textContent = rep ? Number(rep.value).toFixed(1) + '%' : '--';
    const members = getRows('membership');
    document.getElementById('kpi-user-members').textContent = members.find(m => m.segment === 'total_2024') ? (Number(members.find(m => m.segment === 'total_2024').value) / 100).toFixed(2) + 'M' : '--';
    document.getElementById('kpi-user-newmembers').textContent = members.find(m => m.segment === 'new_2024') ? (Number(members.find(m => m.segment === 'new_2024').value) / 100).toFixed(2) + 'M' : '--';

    function barChart(id, rows, color) {
        if (!rows.length) { showEmpty(id); return; }
        var c = initChart(id);
        c.setOption({
            tooltip: { trigger: 'axis', valueFormatter: v => v + '%' },
            grid: { left: 80, right: 30, bottom: 40, top: 20 },
            xAxis: { type: 'category', data: rows.map(r => r.label), axisLabel: { rotate: 20 } },
            yAxis: { type: 'value', axisLabel: { formatter: '{value}%' } },
            series: [{
                type: 'bar', data: rows.map(r => Number(r.value)),
                itemStyle: { color: color || '#E94F7F' }, barWidth: '50%',
                label: { show: true, position: 'top', formatter: p => p.data + '%' }
            }]
        });
    }

    // Age distribution
    barChart('chart-user-age', getRows('age_distribution'), '#3D7BFF');

    // Gender ratio donut
    const gender = getRows('gender');
    if (!gender.length) {
        showEmpty('chart-user-gender');
    } else {
        var c2 = initChart('chart-user-gender');
        c2.setOption({
            tooltip: { trigger: 'item', valueFormatter: v => v + '%' },
            legend: { bottom: 10 },
            series: [{
                type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
                data: gender.map(g => ({ value: Number(g.value), name: g.label, itemStyle: { color: g.segment === 'female' ? '#E94F7F' : '#3D7BFF' } })),
                label: { formatter: '{b}: {d}%' }
            }]
        });
    }

    // Annual spending segments
    barChart('chart-user-spending', getRows('spending'), '#26A69A');

    // Purchase frequency
    barChart('chart-user-frequency', getRows('frequency'), '#E88900');

    // First-touch IP
    barChart('chart-user-firstip', getRows('first_touch_ip'), '#7C3AED');

    // Purchase motives (5-point scale)
    const motive = getRows('motive');
    if (!motive.length) {
        showEmpty('chart-user-motive');
    } else {
        var c3 = initChart('chart-user-motive');
        c3.setOption({
            tooltip: { trigger: 'axis' },
            grid: { left: 140, right: 40, bottom: 40, top: 20 },
            yAxis: { type: 'category', data: motive.map(r => r.label) },
            xAxis: { type: 'value', max: 5, name: '5-point' },
            series: [{
                type: 'bar', data: motive.map(r => Number(r.value)),
                itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#7C3AED' }, { offset: 1, color: '#E94F7F' }]) },
                barWidth: '60%',
                label: { show: true, position: 'right' }
            }]
        });
    }

}


// ===== Hot Search Trends (real archive data) =====
async function loadHotsearch() {
    const data = await fetchJSON('/api/hotsearch');
    if (!data) return;
    if (!data.length) {
        showEmpty('chart-hotsearch-timeline'); showEmpty('chart-hotsearch-monthly');
        showEmpty('chart-hotsearch-category'); showEmpty('chart-hotsearch-platform');
        return;
    }

    // Timeline: all entries; Weibo carries the real hot value, other
    // platforms carry rank-based estimates (volume_note column)
    const vol = data.filter(d => Number(d.search_volume) > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!vol.length) {
        showEmpty('chart-hotsearch-timeline', 'No hot search entries in this window');
    } else {
        const volNotes = {};
        vol.forEach(d => { volNotes[d.date + ' ' + d.keyword] = d.volume_note || ''; });
        var c1 = initChart('chart-hotsearch-timeline');
        c1.setOption({
            tooltip: { trigger: 'axis', formatter: p => {
                const key = p[0].axisValue;
                const note = volNotes[key] ? ' [' + volNotes[key] + ']' : '';
                return key + note + '<br>' + p.map(s => s.marker + s.seriesName + ': ' + formatNum(s.data)).join('<br>');
            } },
            legend: { bottom: 0, data: ['Hot Value'] },
            grid: { left: 80, right: 30, bottom: 60, top: 20 },
            xAxis: { type: 'category', data: vol.map(d => d.date + ' ' + d.keyword.substring(0, 8)), axisLabel: { rotate: 45, fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { formatter: v => formatCompact(v) } },
            series: [{
                name: 'Hot Value', type: 'bar', data: vol.map(d => Number(d.search_volume)),
                itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#E94F7F' }, { offset: 1, color: '#7C3AED' }]) },
                barWidth: '60%'
            }]
        });
    }

    // Monthly entries stacked by platform (all rows, real presence counts)
    const months = [...new Set(data.map(d => d.date.slice(0, 7)))].sort();
    const plats = [...new Set(data.map(d => d.platform))];
    const counts = {};
    data.forEach(d => {
        const k = d.platform + '|' + d.date.slice(0, 7);
        counts[k] = (counts[k] || 0) + 1;
    });
    var c2 = initChart('chart-hotsearch-monthly');
    c2.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, data: plats },
        grid: { left: 60, right: 30, bottom: 60, top: 20 },
        xAxis: { type: 'category', data: months, axisLabel: { rotate: 45 } },
        yAxis: { type: 'value', name: 'Entries' },
        series: plats.map(p => ({
            name: p, type: 'bar', stack: 'total', barWidth: '60%',
            data: months.map(m => counts[p + '|' + m] || 0)
        }))
    });

    // Category share (counts of appearances)
    const catMap = {};
    data.forEach(d => catMap[d.category] = (catMap[d.category] || 0) + 1);
    var c3 = initChart('chart-hotsearch-category');
    c3.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0, type: 'scroll' },
        series: [{
            type: 'pie', radius: ['35%', '65%'], center: ['50%', '42%'],
            data: Object.entries(catMap).map(([k, v]) => ({ value: v, name: k })),
            label: { formatter: '{b}\n{d}%' }
        }]
    });

    // Platform share (counts of appearances)
    const platMap = {};
    data.forEach(d => platMap[d.platform] = (platMap[d.platform] || 0) + 1);
    var c4 = initChart('chart-hotsearch-platform');
    c4.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 10 },
        series: [{
            type: 'pie', radius: '60%', center: ['50%', '45%'],
            data: Object.entries(platMap).map(([k, v]) => ({ value: v, name: k })),
            label: { formatter: '{b}: {c} ({d}%)' }
        }]
    });
}

// ===== Real Comments (Bilibili) =====
async function loadComments() {
    const data = await fetchJSON('/api/comments');
    if (!data) return;
    if (!data.length) {
        document.getElementById('top-comments').innerHTML = '<div class="empty-state">No real comment data yet (Bilibili API returned nothing)</div>';
        showEmpty('chart-comment-sentiment');
        return;
    }

    const top = [...data].sort((a, b) => Number(b.likes) - Number(a.likes)).slice(0, 10);
    const container = document.getElementById('top-comments');
    container.innerHTML = top.map(c => {
        const cls = c.sentiment === 'positive' ? 'tag-positive' : c.sentiment === 'negative' ? 'tag-negative' : 'tag-neutral';
        const label = c.sentiment === 'positive' ? 'Positive' : c.sentiment === 'negative' ? 'Negative' : 'Neutral';
        return '<div class="comment-item">' +
            '<div class="comment-user">' + escapeHTML(c.username) + ' (' + escapeHTML(c.platform) + ') <span class="' + cls + '">[' + label + ']</span></div>' +
            '<div class="comment-text">' + escapeHTML(c.comment_text) + '</div>' +
            '<div class="comment-meta">Likes: ' + formatNum(c.likes) + ' | Replies: ' + c.replies + ' | ' + escapeHTML(c.timestamp) + ' | Video: ' + escapeHTML(c.video_title) + '</div>' +
            '</div>';
    }).join('');

    // Sentiment by IP (all comments are Bilibili; grouping by platform would be one bar)
    const ipSentiment = {};
    data.forEach(c => {
        if (!ipSentiment[c.ip_name]) ipSentiment[c.ip_name] = { positive: 0, neutral: 0, negative: 0 };
        ipSentiment[c.ip_name][c.sentiment]++;
    });
    const ips = Object.keys(ipSentiment);
    var c1 = initChart('chart-comment-sentiment');
    c1.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { bottom: 0, data: ['Positive', 'Neutral', 'Negative'] },
        grid: { left: 80, right: 30, bottom: 40, top: 20 },
        xAxis: { type: 'category', data: ips, axisLabel: { rotate: 20 } },
        yAxis: { type: 'value' },
        series: [
            { name: 'Positive', type: 'bar', stack: 'total', data: ips.map(p => ipSentiment[p].positive), itemStyle: { color: COL_POS, borderWidth: 2, borderColor: '#fff' } },
            { name: 'Neutral', type: 'bar', stack: 'total', data: ips.map(p => ipSentiment[p].neutral), itemStyle: { color: COL_NEU, borderWidth: 2, borderColor: '#fff' } },
            { name: 'Negative', type: 'bar', stack: 'total', data: ips.map(p => ipSentiment[p].negative), itemStyle: { color: COL_NEG, borderWidth: 2, borderColor: '#fff' } }
        ]
    });
}

// ===== Initialize =====
window.addEventListener('load', async () => {
    fetchJSON('/api/meta').then(m => {
        if (m && m.retrieved) document.getElementById('retrieved-at').textContent = m.retrieved;
    }).catch(() => {});
    await loadOverview();
});
window.addEventListener('resize', () => {
    Object.values(chartInstances).forEach(c => c.resize());
});
