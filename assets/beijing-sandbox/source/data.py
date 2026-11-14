import json
from pathlib import Path

O = (116.4, 39.931)
def geo(lon, lat):
    return [round((lon-O[0])*850, 2), round((O[1]-lat)*1110, 2)]

GROUPS = [
    ('中轴古城', '#ae543a'), ('园林水岸', '#557951'),
    ('现代北京', '#3a7385'), ('交通枢纽', '#7e6c56'),
]
# Altitude is the label anchor above local ground, in GLB units.
ROWS = [
 ('bell-drum','钟鼓楼','东城 · 地安门外',0,116.3966,39.9418,7.5,'沿地安门外大街向北，红墙鼓楼与灰砖钟楼相对，是老城中轴线的北端。'),
 ('nanluoguxiang','南锣鼓巷','东城 · 交道口',0,116.40315,39.93733,1.4,'从南锣鼓巷转进东西向的支巷，能看到灰瓦院墙、木门和围着院心布置的四合院。临主巷的几间房也开着沿街小店。'),
 ('jingshan','景山公园','西城 · 景山前街',0,116.3967,39.9251,11,'从万春亭往南，可以俯瞰故宫层层铺开的金色屋顶。'),
 ('forbidden-city','故宫博物院','东城 · 故宫',0,116.3970,39.9166,7,'午门、太和殿与神武门沿中轴排列，金瓦红墙之间是一重又一重院落。'),
 ('tiananmen','天安门广场','东城 · 长安街',0,116.3975,39.9055,2.7,'长安街南侧的开阔广场，向北可望见天安门城楼，向南通往正阳门。'),
 ('qianmen','前门大街','东城 · 正阳门以南',0,116.3974,39.8946,4,'走过正阳门，沿前门大街向南，街巷两侧是老字号和沿街店铺。'),
 ('temple-of-heaven','天坛公园','东城 · 天坛东路',0,116.4066,39.8822,8,'苍松古柏之间，祈年殿的三层蓝瓦圆顶格外醒目。'),
 ('yongdingmen','永定门','东城 · 中轴南端',0,116.3981,39.8725,7,'永定门城楼位于老城中轴南端，向北连着中轴道路，向南临近护城河。'),
 ('shichahai','什刹海','西城 · 鼓楼西侧',1,116.3849,39.9429,1.5,'在前海、后海沿岸散步，可由银锭桥转入水边胡同。'),
 ('beihai','北海公园','西城 · 文津街',1,116.3891,39.9258,9,'琼华岛上的白塔高出树冠，湖面将白塔、长廊与城墙隔开。'),
 ('summer-palace','颐和园','海淀 · 昆明湖',1,116.2744,39.9973,10,'从万寿山佛香阁向南是昆明湖，长廊随湖岸展开，十七孔桥通向南湖岛。'),
 ('yuanmingyuan','圆明园','海淀 · 清华西路',1,116.3100,40.0053,2,'水系和园路串起旧日园址，西洋楼遗址保留着石构断垣。'),
 ('peking-university','北京大学未名湖','海淀 · 燕园',1,116.30528,39.98972,7.0,'博雅塔立在未名湖东南岸。湖边石径经过低矮的燕园院落，转过岸角就能见到塔影。'),
 ('tsinghua-university','清华大学大礼堂','海淀 · 清华园',1,116.3261,40.0030,6.6,'大礼堂的圆顶和古典柱廊面向草坪。顺着草地中的道路向南，经过日晷便是清华园二校门。'),
 ('olympic','奥林匹克公园','朝阳 · 奥林匹克公园',2,116.3934,39.9940,2,'城市中轴线向北延伸至奥林匹克公园，公共步道将体育场馆和北侧森林公园串联起来。'),
 ('bird-nest','鸟巢','朝阳 · 国家体育场',2,116.3965,39.9916,7,'国家体育场外侧交错的钢构包围着椭圆看台，可以从广场上看清整座建筑的轮廓。'),
 ('water-cube','水立方','朝阳 · 国家游泳中心',2,116.38417,39.99158,5.2,'国家游泳中心的蓝色外立面由不规则的泡状单元组成，入夜后尤为显眼。'),
 ('olympic-tower','奥林匹克塔','朝阳 · 奥林匹克森林公园南侧',2,116.38784,40.00651,12,'从场馆向北走，五根高低错落的塔柱在森林公园南侧展开，塔冠像五朵大小不同的花。'),
 ('ice-ribbon','冰丝带','朝阳 · 国家速滑馆',2,116.371414,40.015892,5.0,'椭圆形的速滑馆外包着一圈圈起伏的玻璃带，入夜后环绕场馆的线条会亮起。'),
 ('ncp','国家大剧院','西城 · 西长安街',2,116.3831,39.9030,4.1,'水面托着一座银色椭球，从长安街一侧就能看到壳体与倒影。'),
 ('wangfujing','王府井','东城 · 王府井大街',2,116.4119,39.9134,5.0,'从长安街拐入王府井大街，百货、书店和小吃铺沿街展开。'),
 ('sanlitun','三里屯太古里','朝阳 · 三里屯路',2,116.4542,39.9368,5.5,'低层商铺以巷道和庭院相连，咖啡店和餐馆围着开放街区。'),
 ('liangma-river','亮马河','朝阳 · 亮马桥水岸',1,116.4642,39.9507,2.2,'从亮马桥一带沿河向东，步道、桥下空间和亲水平台连接起三里屯与蓝色港湾。'),
 ('798-art-zone','798艺术区','朝阳 · 酒仙桥',2,116.48978,39.98294,5.8,'沿旧厂房之间的巷道走，锯齿形屋顶和红砖烟囱仍在，画廊与展厅散布在不同车间里。'),
 ('cbd','国贸','朝阳 · 建国门外',2,116.4618,39.9087,2.25,'国贸一带高楼连成天际线。从建国路向北，可以看到光华路上的中国尊和央视总部。'),
 ('cctv-headquarters','央视总部大楼','朝阳 · 东三环中路',2,116.45805,39.91347,13,'两座倾斜塔楼通过悬挑的顶部连成一个不规则的环。站在楼外抬头，可以看到中间透空的轮廓和交错的钢结构。'),
 ('china-zun','中国尊','朝阳 · 光华路',2,116.46028,39.91139,17.7,'中信大厦取形于古代青铜尊，塔身中段收腰，近顶部重新展开。'),
 ('central-tv-tower','中央电视塔','海淀 · 西三环中路',2,116.30028,39.91806,16.6,'中央广播电视塔立在玉渊潭西侧。细长塔身托起一圈观景层，顶部是一段红白相间的天线。'),
 ('yuyuantan','玉渊潭公园','海淀 · 西三环中路',1,116.3109,39.9177,2,'沿湖岸走过樱园和跨湖桥，向西能看见中央电视塔高出树冠。'),
 ('beijing-station','北京站','东城 · 北京站街',3,116.4272,39.9034,5,'北京站站房面向北广场，两端钟楼是从街面辨认车站的标志。'),
 ('beijing-west','北京西站','丰台 · 莲花池东路',3,116.32206,39.89491,6.6,'北广场正对大跨度站房，中部的楼亭和下方层层展开的站前车道构成车站的正面轮廓。'),
 ('fangzhuang','方庄','丰台 · 方庄街区',2,116.42129,39.86014,3.8,'沿小区外的街道走过底层商铺，转进林荫步道，能看到不同年代的板楼、住宅塔楼和楼间小院。'),
 ('beijing-south','北京南站','丰台 · 永外大街',3,116.3782,39.8652,5,'北京南站的大跨度椭圆屋顶覆盖站房和站台，南广场与城市道路相接。'),
]
ALIASES = {
    'nanluoguxiang': ['南锣', '胡同', '四合院', '老城民居'],
    'fangzhuang': ['居民楼', '小区', '住宅', '居民区', '住宅区'],
    'peking-university': ['北大', '燕园', '未名湖', '博雅塔'],
    'tsinghua-university': ['清华', '清华园', '清华大礼堂', '二校门'],
    'liangma-river': ['亮马桥', '亮马河国际风情水岸'],
    '798-art-zone': ['798', '大山子', '七九八'],
    'ice-ribbon': ['国家速滑馆', '速滑馆', '奥体', '冬奥'],
    'beijing-west': ['西客站', '北京西', '西站'], 
    'water-cube': ['国家游泳中心', '冰立方', '奥体', 'Water Cube'],
    'bird-nest': ['国家体育场', '奥体', 'Bird Nest'],
    'olympic': ['奥体', '奥林匹克中心'],
    'olympic-tower': ['奥体', '奥林匹克公园瞭望塔', '大钉子'],
    'cctv-headquarters': ['电视台', '央视', '中央电视台', '央视大楼', '大裤衩', 'CCTV'],
    'central-tv-tower': ['电视台', '电视塔', '中央广播电视塔', '央视塔'],
    'china-zun': ['中信大厦', '中信总部', 'CITIC Tower'],
}
MINX, MAXX, MINZ, MAXZ = -117, 91, -105, 91
LOC = {}
for slug,name,subtitle,category,lon,lat,y,description in ROWS:
    x,z=geo(lon,lat)
    LOC[slug] = dict(id='beijing-'+slug,name=name,subtitle=subtitle,category=category,
                    description=description,lonLat=[lon,lat],x=x,y=y,z=z)
    if slug in ALIASES:
        LOC[slug]['aliases'] = ALIASES[slug]

def path(*items):
    return [[LOC[p]['x'],LOC[p]['z']] if isinstance(p,str) else list(p) for p in items]
# Waypoints follow schematic streets, waterside walks, or transit corridors.
SPECS = [
 ('bell-drum','shichahai',12,'步行',(-5,-12),(-10,-11)),
 ('bell-drum','nanluoguxiang',13,'步行',(-1.4,-7.03),(.85,-7.03)),
 ('nanluoguxiang','jingshan',19,'步行',(2.68,-4.7),(3.7,-1),(1.2,3.8)),
 ('bell-drum','jingshan',25,'步行',(-3,-7),(-3,2)),
 ('shichahai','beihai',23,'步行',(-13,-8),(-12,-2)),
 ('beihai','jingshan',14,'步行',(-8,6)),
 ('jingshan','forbidden-city',15,'步行',(3,8),(3,12)),
 ('forbidden-city','tiananmen',22,'步行',(1,21),(0,24)),
 ('tiananmen','qianmen',15,'步行',(-2,32)),
 ('qianmen','temple-of-heaven',28,'步行',(-1,46),(3,46)),
 ('qianmen','yongdingmen',34,'步行',(-1,49),(-1,60)),
 ('temple-of-heaven','yongdingmen',20,'步行',(6,61),(0,63)),
 ('tiananmen','ncp',9,'步行',(-7,28),(-14,28)),
 ('tiananmen','wangfujing',19,'步行',(5,28),(10,27)),
 ('wangfujing','beijing-station',19,'市内交通',(15,21),(20,25)),
 ('beijing-station','cbd',19,'市内交通',(33,29),(39,24)),
 ('cbd','china-zun',7,'步行',(54,23.4)),
 ('china-zun','cctv-headquarters',9,'步行',(54.8,20),(53,18)),
 ('cctv-headquarters','sanlitun',20,'市内交通',(46,12),(45,1)),
 ('liangma-river','sanlitun',17,'步行',(51,-12),(52,-18)),
 ('liangma-river','798-art-zone',25,'市内交通',(63,-28),(72,-44),(74,-53)),
 ('798-art-zone','olympic',31,'市内交通',(57,-57),(36,-62),(16,-66)),
 ('cbd','sanlitun',24,'市内交通',(53,7),(49,-5)),
 ('sanlitun','olympic',37,'市内交通',(50,-20),(44,-42),(24,-61),(5,-68)),
 ('bell-drum','olympic',32,'市内交通',(-2,-24),(-1,-42),(-2,-58)),
 ('olympic','bird-nest',8,'步行',(-4,-68)),
 ('olympic','water-cube',9,'步行',(-10,-70)),
 ('olympic','olympic-tower',16,'步行',(-7,-75),(-8,-81)),
 ('olympic-tower','ice-ribbon',23,'步行',(-14,-88),(-21,-91)),
 ('water-cube','olympic-tower',19,'步行',(-15,-74),(-12,-82)),
 ('bird-nest','water-cube',12,'步行',(-7,-64),(-12,-64)),
 ('olympic','yuanmingyuan',33,'市内交通',(-17,-71),(-35,-75),(-61,-78)),
 ('ice-ribbon','tsinghua-university',32,'市内交通',(-34,-96),(-49,-91)),
 ('tsinghua-university','yuanmingyuan',18,'市内交通',(-68,-82),(-74,-84)),
 ('tsinghua-university','peking-university',29,'步行',(-63,-76),(-74,-71)),
 ('peking-university','summer-palace',31,'市内交通',(-90,-58),(-99,-61)),
 ('yuanmingyuan','summer-palace',18,'市内交通',(-86,-81),(-94,-78)),
 ('beihai','yuyuantan',34,'市内交通',(-24,8),(-44,6),(-62,10),(-70,13)),
 ('yuyuantan','central-tv-tower',17,'步行',(-77,20),(-83,19)),
 ('central-tv-tower','summer-palace',36,'市内交通',(-86,-4),(-86,-32),(-92,-52)),
 ('beihai','summer-palace',42,'市内交通',(-18,5),(-32,0),(-55,-15),(-78,-37),(-98,-52)),
 ('beijing-west','yuyuantan',28,'市内交通',(-68,29),(-68,24),(-72,21)),
 ('beijing-west','ncp',30,'市内交通',(-55,37),(-44,30),(-25,29)),
 ('beijing-west','beijing-south',27,'市内交通',(-58,47),(-47,57),(-32,65)),
 ('temple-of-heaven','fangzhuang',29,'市内交通',(10,63),(16,71),(18.1,75)),
 ('fangzhuang','beijing-south',27,'市内交通',(14.5,72.7),(4.6,72.8),(-7,74.4)),
 ('yongdingmen','beijing-south',23,'市内交通',(-8,67),(-12,69)),
 ('ncp','beijing-south',25,'市内交通',(-20,38),(-21,50),(-20,62)),
]
EDGES = [
    dict(**{'from':LOC[a]['id'], 'to':LOC[b]['id']}, minutes=m, method=mode,
         points=path(a,*way,b))
    for a,b,m,mode,*way in SPECS
]
TOURS = [
 dict(name='沿中轴走',stops=['bell-drum','jingshan','forbidden-city','tiananmen','qianmen','temple-of-heaven','yongdingmen']),
 dict(name='胡同散步',stops=['shichahai','bell-drum','nanluoguxiang','jingshan']),
 dict(name='三处水岸',stops=['shichahai','beihai','summer-palace']),
 dict(name='从燕园到清华园',stops=['summer-palace','peking-university','tsinghua-university','yuanmingyuan']),
 dict(name='从老城到天际线',stops=['ncp','tiananmen','wangfujing','beijing-station','cbd','china-zun','cctv-headquarters','sanlitun','olympic','bird-nest','water-cube','olympic-tower']),
]
for tour in TOURS:
    tour['stops']=['beijing-'+s for s in tour['stops']]
FOCUS_AREAS = [
    dict(name='老城胡同', places=['nanluoguxiang','bell-drum','shichahai'],
         view=dict(x=5.5,z=-8.1,yaw=-.37,tilt=.82,zoom=12.4)),
    dict(name='方庄居民区', places=['fangzhuang','temple-of-heaven','beijing-south'],
         view=dict(x=18.0,z=80.6,yaw=-.54,tilt=.68,zoom=11.5)),
    dict(name='奥体场馆', places=['water-cube','bird-nest','olympic-tower','ice-ribbon','olympic']),
    dict(name='国贸天际线', places=['cctv-headquarters','china-zun','cbd','sanlitun']),
    dict(name='海淀校园', places=['peking-university','tsinghua-university','yuanmingyuan','summer-palace']),
    dict(name='朝阳街区', places=['798-art-zone','liangma-river','sanlitun']),
    dict(name='玉渊潭', places=['central-tv-tower','yuyuantan','beijing-west']),

]
for area in FOCUS_AREAS:
    area['places']=['beijing-'+slug for slug in area['places']]
SOURCES = [
 dict(name='联合国教科文组织 · 北京中轴线地图',url='https://whc.unesco.org/en/list/1714/maps/'),
 dict(name='北京市政府 · 中轴线沿线景点',url='https://english.beijing.gov.cn/travellinginbeijing/citytours/202006/t20200608_1918916.html'),
 dict(name='北京市政府 · 奥林匹克公园',url='https://english.beijing.gov.cn/travellinginbeijing/focus/202012/t20201214_2164198.html'),
 dict(name='北京市政府 · 颐和园',url='https://english.beijing.gov.cn/specials/strollthroughbeijing/imperialgardens/202611/t20261109_4938611.html'),
 dict(name='OMA · 央视总部大楼',url='https://www.oma.com/projects/cctv-headquarters'),
 dict(name='KPF · 中国尊',url='https://www.kpf.com/project/citic-tower-china-zun'),
 dict(name='北京市政府 · 中央电视塔',url='https://english.beijing.gov.cn/travellinginbeijing/attractions/202603/t20260320_4562520.html'),
 dict(name='北京市政府 · 玉渊潭公园',url='https://english.beijing.gov.cn/beijinginfo/culture/beijingtownscape/parks/202401/t20240116_3536974.html'),
 dict(name='北京大学 · 燕园地标',url='https://www.pku.edu.cn/visit.html'),
 dict(name='清华大学 · 大礼堂',url='https://www.redweb.tsinghua.edu.cn/info/1023/1780.htm'),
 dict(name='北京市政府 · 798艺术区',url='https://english.beijing.gov.cn/forum/2026citytour/citytourright/202610/t20261002_4889380.html'),
 dict(name='北京市政府 · 亮马河',url='https://english.beijing.gov.cn/travellinginbeijing/attractions/202603/t20260323_4563863.html'),
 dict(name='北京市旅游 · 南锣鼓巷的胡同与四合院',url='https://english.visitbeijing.com.cn/article/4FYfqejIeRN'),
 dict(name='北京市政府 · 什刹海步行线路',url='https://english.beijing.gov.cn/travellinginbeijing/hotroutes/202406/t20240627_3730281.html'),
 dict(name='Mapcarta · 方庄街区',url='https://mapcarta.com/N8987580503'),
 dict(name='Olympedia · 国家速滑馆',url='https://www.olympedia.org/venues/2140')
]
ATLAS = dict(schemaVersion=1,id='beijing',name='北京市',center=O,
    coordinates=dict(system='local-equirectangular',upAxis='Y',eastAxis='+X',southAxis='+Z',
        lonMultiplier=850,latMultiplier=1110,approxMetersPerUnit=100,geometryScale='stylized'),
    bounds=dict(minX=MINX,maxX=MAXX,minZ=MINZ,maxZ=MAXZ),startId='beijing-forbidden-city',
    model='unread-city-beijing-sandbox.glb',
    categories=[dict(name=label,color=color) for label,color in GROUPS],
    places=[dict(p,modelNode='poi-'+p['id']) for p in LOC.values()],routes=EDGES,tours=TOURS,focusAreas=FOCUS_AREAS,sources=SOURCES)

if __name__ == '__main__':
    output=Path(__file__).resolve().parent
    (output/'beijing-atlas.json').write_text(json.dumps(ATLAS,ensure_ascii=False,indent=2)+'\n')
