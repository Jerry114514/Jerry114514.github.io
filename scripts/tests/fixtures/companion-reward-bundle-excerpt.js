/* 裁剪过的 companion 前端 bundle 片段：只保留「奖励分类」所需的结构。
   真身 = https://helldiverscompanion.com/_app/immutable/chunks/<hash>.js（7 MB 级，
   chunk 名带内容哈希，随每次前端构建变化）；这里删掉了其余代码、把 id 数组截短，
   但**结构原样保留**，供 scripts/tests/test_reward_types.py 离线跑解析回归：
     · 解析函数的锚点：`=e=>{const t=<idMap>[e];return t||(` + 第一个分支 `text:"Cape"`
     · 分支顺序 = companion 的判定顺序，最后 `text:"Item"` 兜底
     · id 数组两种声明写法都要覆盖：逗号声明列表（`,Jde=[…]`）与单独 `const Kde=[…]`
       （2026-10-13：只认前者会漏掉整个 Helmet 表，实测丢 275 条）
     · 货币类不在数组里，是 {id,text,icBuild,icon} 对象字面量
   断言用到的 id 是真值（3890208935=Cape、1618361436/2237630340=Stratagem、897894480=勋章、
   3608481516=征用单），其余是合成 id（1xxxxxxxxx）。 */
const Kde=[1000000001,1000000002,1000000003,1000000004,1000000005,1000000006,1000000007,1000000008,1000000009,1000000010,1000000011,1000000012,1000000013,1000000014,1000000015,1000000016];
const catalog={WarbondMedal:{id:897894480,text:"Warbond Medal",icBuild:"currency.medal|#ccc566|&040303a3|0.8|0,2",icon:"currency.medal",color:"medal_gold"},RequisitionSlip:{id:3608481516,text:"Requisition Slip",icBuild:"currency.reqslip|#ffff60|0.72|0,2.4",icon:"currency.reqslip",color:"olive"}};
const Qde=[3890208935,1000000021,1000000022,1000000023,1000000024,1000000025,1000000026,1000000027,1000000028,1000000029,1000000030,1000000031,1000000032,1000000033,1000000034,1000000035],Jde=[1000000041,1000000042,1000000043,1000000044,1000000045,1000000046,1000000047,1000000048,1000000049,1000000050,1000000051,1000000052,1000000053,1000000054,1000000055,1000000056];
const nhe={897894480:catalog.WarbondMedal,3608481516:catalog.RequisitionSlip},$de=[1000000061,1000000062,1000000063,1000000064,1000000065,1000000066,1000000067,1000000068,1000000069,1000000070,1000000071,1000000072,1000000073,1000000074,1000000075,1000000076];
const ehe=[1000000081,1000000082,1000000083,1000000084,1000000085,1000000086,1000000087,1000000088,1000000089,1000000090,1000000091,1000000092,1000000093,1000000094,1000000095,1000000096];
const the=[1000000101,1000000102,1000000103,1000000104,1000000105,1000000106,1000000107,1000000108,1000000109,1000000110,1000000111,1000000112,1000000113,1000000114,1000000115,1000000116];
const ihe=[1618361436,2237630340,1000000122,1000000123,1000000124,1000000125,1000000126,1000000127,1000000128,1000000129,1000000130,1000000131,1000000132,1000000133,1000000134,1000000135];
const rhe=[1000000141,1000000142,1000000143,1000000144,1000000145,1000000146,1000000147,1000000148,1000000149,1000000150,1000000151,1000000152,1000000153,1000000154,1000000155,1000000156];
const yg=e=>{const t=nhe[e];return t||(Qde.includes(e)?{id:e,text:"Cape",icBuild:"currency.item_cape2|#FBFAF5|0.8|0,-3",icon:"currency.item_cape2",color:"diver_yellow"}:Jde.includes(e)?{id:e,text:"Body Armor",icBuild:"currency.item_armor|#FBFAF5|0.72",icon:"currency.item_armor",color:"diver_yellow"}:Kde.includes(e)?{id:e,text:"Helmet",icBuild:"currency.item_helmet|#FBFAF5|0.80",icon:"currency.item_helmet",color:"diver_yellow"}:$de.includes(e)?{id:e,text:"Primary",icBuild:"currency.item_rifle|#FBFAF5|0.8|0,-1",icon:"currency.item_rifle",color:"diver_yellow"}:ehe.includes(e)?{id:e,text:"Sidearm",icBuild:"currency.item_pistol|#FBFAF5|0.80|1,-4",icon:"currency.item_pistol",color:"diver_yellow"}:the.includes(e)?{id:e,text:"Throwable",icBuild:"currency.item_grenade|#FBFAF5|0.64",icon:"currency.item_grenade",color:"diver_yellow"}:ihe.includes(e)?{id:e,text:"Stratagem",icBuild:"currency.item_stratagem|#FBFAF5|0.56",icon:"currency.item_stratagem",color:"diver_yellow"}:rhe.includes(e)?{id:e,text:"Pattern",icBuild:"entity.cosmetic_pattern|#FBFAF5|0.7",icon:"currency.cosmetic_pattern",color:"diver_yellow"}:{text:"Item",icBuild:"entity.generic|0.64",icon:"entity.generic",color:"diver_yellow"})};
