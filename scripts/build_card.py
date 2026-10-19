#!/usr/bin/env python3
"""Build an importable SillyTavern character-card PNG from editable sources."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from card_codec import CardError, assert_card, encode_card

ROOT = Path(__file__).resolve().parents[1]
IMMERSIVE_SCRIPT_ID = "9d9bc6da-0c08-4d1f-8d18-451c4de6e295"
IMMERSIVE_VERSION = "0.2.0-p0p1"
BUNDLE_MARKER = "UNREAD_CITY_IMMERSIVE_BUNDLE"
NOTES_START = "[未读之城 Immersive P0/P1]"
NOTES_END = "[/未读之城 Immersive P0/P1]"


def read_frontend_bundle(path: Path) -> str:
    """Load a locally built IIFE without evaluating its JavaScript."""
    if not path.is_file():
        raise CardError(f"没有找到前端构建产物：{path}。请先运行 npm run build。")
    content = path.read_text(encoding="utf-8-sig")
    if not content.strip():
        raise CardError("前端构建产物为空。请重新运行 npm run build。")
    if BUNDLE_MARKER not in content[:512] or len(content) < 256:
        raise CardError("前端文件不是本项目的完整构建产物；请使用 dist/immersive-shell.js。")
    if content.lstrip().startswith("<") or re.search(
        r"(?m)^\s*(?:import\s+(?:[\"'{*]|\w+\s+from\b)|export\s+(?:default\b|const\b|function\b|class\b|\{))",
        content,
    ):
        raise CardError("前端文件仍是 HTML 或 ES 模块；请先构建单文件 IIFE，再打包 PNG。")
    return content


def attach_frontend(data: dict, content: str) -> None:
    """Attach our script while retaining unrelated extensions and scripts."""
    extensions = data.setdefault("extensions", {})
    helper = extensions.setdefault("tavern_helper", {})
    if not isinstance(helper, dict):
        raise CardError("extensions.tavern_helper 必须是对象，不能覆盖已有非对象数据。")
    scripts = helper.setdefault("scripts", [])
    if not isinstance(scripts, list):
        raise CardError("extensions.tavern_helper.scripts 必须是数组。")
    own = next((row for row in scripts if isinstance(row, dict) and row.get("id") == IMMERSIVE_SCRIPT_ID), {})
    script = {
        **own,
        "type": "script",
        "enabled": True,
        "name": "未读之城 · Immersive Shell",
        "id": IMMERSIVE_SCRIPT_ID,
        "content": content,
        "info": "全屏街景与可收起正文原型；需要 Tavern-Helper。已内嵌 ST-iPhonie，NPC 联系人与剧情消息按聊天联动，手机未读同步至常驻按钮。首次启用需按助手提示授权。场景与人物均为示例。",
        "button": {
            "enabled": True,
            "buttons": [
                {"name": "进入未读之城", "visible": True},
                {"name": "恢复原生界面", "visible": True},
            ],
        },
        "data": own.get("data", {}),
        "export_with": {"data": False, "button": True},
    }
    # Preserve the position of an existing copy; remove accidental duplicates of our ID only.
    output = []
    replaced = False
    for row in scripts:
        if isinstance(row, dict) and row.get("id") == IMMERSIVE_SCRIPT_ID:
            if not replaced:
                output.append(script)
                replaced = True
        else:
            output.append(row)
    if not replaced:
        output.append(script)
    helper["scripts"] = output

    project = extensions.setdefault("unread_city", {})
    if not isinstance(project, dict):
        raise CardError("extensions.unread_city 必须是对象，不能覆盖已有非对象数据。")
    immersive = project.setdefault("immersive", {})
    if not isinstance(immersive, dict):
        raise CardError("extensions.unread_city.immersive 必须是对象。")
    immersive.update({
        "version": IMMERSIVE_VERSION,
        "enabled": True,
        "script_id": IMMERSIVE_SCRIPT_ID,
        "bundle": "embedded-iife",
        "requires": {"tavern_helper": True},
        "real_import_verified": False,
    })
    previous_notes = data.get("creator_notes", "")
    if not isinstance(previous_notes, str):
        raise CardError("creator_notes 必须是字符串。")
    previous_notes = re.sub(
        re.escape(NOTES_START) + r".*?" + re.escape(NOTES_END), "", previous_notes, flags=re.S
    ).rstrip()
    build_notes = (
        f"{NOTES_START}\n"
        "本构建新增沉浸式 P0/P1 原型，此说明更新前述基础模板的实现状态。"
        "先安装 Tavern-Helper，再导入 PNG、授权启用角色脚本，通过“进入未读之城”打开界面；"
        "“恢复原生界面”可退出。Vue、CSS 和本项目资源已内嵌；助手本身仍有上游依赖。"
        "状态与叙事保存在当前聊天的 unread_city 变量内，不写原生聊天楼层。"
        "便利店提供饭食、零食、饮品与香烟，每类有三档虚构品牌与品质；先购买进入背包，再按份使用。标准香烟50元一盒20支，使用恢复较多精力并降低压力，同时损失健康。食物补充饱腹与食物能量，已结算的游戏时间会消耗储备；状态页可查看健康、压力、饱腹、食物能量和背包。购买、使用和休息学习均由程序结算并保存，不调用模型；旧存档自动补齐新字段，保留进度。"
        "十二种商品各有内置平涂商品图。小说转场基础精力消耗改为原路线的0.1倍，按健康、饱腹和压力相对50的高低调整；精力不足仍可转场，最多扣到0。学习等耗能交互继续检查精力，并影响精神与压力，休息恢复精神；聊天、观察和点击剧情不扣精力。状态页增加精神值，精力精确到小数点后两位，旧存档保持原有进度。"
        "首次进入选择专业，生成三门课程的周课表；每次学习再选科目，各科独立积累与进阶。图书馆和书店允许跨专业阅读，确认前显示随机奖励或困惑的概率及代价，完成后一次保存实际结果。旧存档保留原科点数，刷新不重复结算。日程与状态可查看课表和各科进度，模型只承接已保存的结果。"
        "全屏背景支持自由行走：点击自由行走，手机用左侧摇杆移动、另一手拖动环视，电脑用 WASD。"
        "素世作为主角外观，深蓝少女、小洋与Claude模型替换场景行人外形；压缩模型和贴图均内嵌同一脚本。"
        "第三人称视角可以看到素世，也可切换第一人称；模型外观不改写已有剧情人物身份或聊天存档。"
        "3D模式打开手机临时切到素世正面低头单手持机画面，另一只手自然放下，收起手机恢复原视角；手机界面整体等比例缩放完整显示，无外层绿色窗口，仅保留手机本体与关闭、放大按钮，可返回人物同框。"
        "可切换纯小说模式：复用内嵌区域背景与素世Live2D，点击逐句推进已生成的旁白、台词并切换表情；已有NPC按姓名与情绪切换基于原外观制作的九种静态全身表情和姿态立绘，小屏等比例完整显示，也可全文回看。地图只保留立体沙盘，连接当前周边和城市片区，小说模式选地点后按预告结算出行并切换背景。点击推进不额外调用模型。"
        "人物素材署名：素世模型很ying的哈呵、MMD转换桔橙；深蓝少女包标签QCQKK、VRM作者K；小洋包标签蜂神扇、VRM作者1；Claude作者Manny/ningfangtianwai-pixel（AI Girls 3D，原文件声明CC BY 4.0）。"
        "建筑与场景边界有碰撞；打开浮窗、阅读或切后台即停步。局部行走更新地点并保存位置，不推进时间，地图负责旅行结算。"
        "校园内可进入学生宿舍、普通教室与图书馆自习室，室内可以行走并走近物件观察、学习或休息。"
        "入口、室内位置与最近活动随聊天保存；物件操作先显示耗时和精力，确认后结算，继续故事才请求模型。"
        "床铺提供短休15–30分钟、中休1–2小时、长休7–9小时，程序在区间内随机确定一次，保存实际时长与恢复精力，不准备或调用对话。"
        "温习笔记与专注自习提供短时15–30分钟、中时1–2小时、长时2–4小时，由程序随机一次，保存实际时长和精力消耗，刷新不重复结算。整理书桌、浏览书架和长椅休息也由程序直接结算，不自动准备对话；旅行与等待沿用程序规则。观察和交谈仍可确认后请求叙事。"
        "道路新增内嵌BTR-82A、ZBD-04A与T-84车辆模型；到南门公交站可搭前两种代用公交前往示例居住区、商业区或城市公园，在站牌处乘车返程。确认乘车后由程序一次结算车程和票价，地点、班次收据与余额随聊天保存，刷新不重复收费；T-84仅作道路环境车辆，不提供战斗或驾驶操作。"
        "正文可展开、收起和回看，手机、地图等通过悬浮窗使用。3D 不可用时保留静态场景。"
        "天空会低频随机出现飞机经过；对话也可触发同一客机事件，累计次数、来源与经过时间随世界存档保存。"
        "远景飞机模型已压缩并内嵌，无需单独下载；原素材为用户提供的苏-30SM外形，按客机环境事件使用。"
        "手机代码与界面已随助手脚本内嵌，无需单独安装 ST-iPhonie；已有兼容手机实例时复用。"
        "手机按钮常驻，进入界面后连接剧情消息，窗口按需打开；仅酒馆助手仍需单独可用。PNG 不包含私人手机数据或密钥。"
        "内嵌版不附带整套音效素材包，保留用户手动导入；不会因打开卡片自动调用模型或远程同步服务。"
        "每个聊天有独立剧情手机空间，NPC 对应联系人，正文与消息一起保存并去重投递，真实已读状态回传前端。"
        "人物页可直接打开对应会话，原有普通手机数据保留。手机手动回复推动剧情及原生楼层双向同步尚未接通。"
        "示例人物与地点仅为交互演示，不属于已确认的正式设定。"
        "当前目标为 V2，以作者本机酒馆和助手的实际运行结果为准，验收记录见工程说明。"
        "源仓库可私有维护，发布的脚本可以从 PNG 提取。\n"
        f"{NOTES_END}"
    )
    data["creator_notes"] = f"{previous_notes}\n\n{build_notes}" if previous_notes else build_notes


def assemble_card(root: Path = ROOT, frontend_path: Path | None = None) -> dict:
    card = json.loads((root / "src/card.json").read_text(encoding="utf-8"))
    assert_card(card)
    data = card["data"]
    entries = []
    books = sorted((root / "src/worldbook").glob("*.json"))
    for path in books:
        book = json.loads(path.read_text(encoding="utf-8"))
        for entry in book.get("entries", []):
            row = {**entry}
            row.setdefault("extensions", {})
            row.setdefault("enabled", True)
            row.setdefault("keys", [])
            row["insertion_order"] = len(entries)
            entries.append(row)
    if entries:
        data["character_book"] = {
            "name": "未读之城：世界书",
            "description": "由 src/worldbook 自动合并。",
            "recursive_scanning": False,
            "extensions": {},
            "entries": entries,
        }
    if frontend_path is not None:
        attach_frontend(data, read_frontend_bundle(frontend_path))
    assert_card(card)
    return card


def main():
    parser = argparse.ArgumentParser(description="构建 Unread City 的 SillyTavern V2 PNG")
    parser.add_argument("--image", type=Path, default=ROOT / "assets/cover.png")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/unread-city.png")
    parser.add_argument("--frontend", type=Path, help="将 npm run build 生成的单文件 IIFE 脚本嵌入 PNG")
    args = parser.parse_args()
    if not args.image.is_file():
        parser.error(f"没有找到封面：{args.image}。请把有效 PNG 放到 assets/cover.png 或指定 --image。")
    try:
        output = encode_card(args.image.read_bytes(), assemble_card(frontend_path=args.frontend))
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(output)
    except (CardError, OSError, ValueError, KeyError, UnicodeError) as exc:
        parser.error(f"构建失败：{exc}")
    print(f"已构建：{args.output} ({len(output)} bytes)")


if __name__ == "__main__":
    main()
