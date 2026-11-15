/**
 * ReasoningNudge —— 架构镜片左上角的「质检 + 推演邀请」。
 *
 * 设计依据：core-semantics.md §2.4（编辑 → 重演 → 对比 是个环，不是流水线）。
 * 核心主张：**思考不是建模的奖励，是建模的质检**。所以把模型的实时体检（几处单点
 * 无兜底）直接摆在建模现场，并给一键推演入口——让 payoff 在第一屏就发生，反过来
 *  motivate 用户认真把底层模型建好（建好了才换得来这些可信的推演）。
 *
 * 它只在「建模态」出现：一旦开始模拟（seeds 非空）或追踪（trace 非空）就让位，
 * 不挡住正在进行的推演。可关闭，选择记在 localStorage（推演入口在抽屉/导航里始终都在，
 * 关掉这条邀请不影响任何功能）。
 */
import { CloseIcon, FindingsIcon, SimulationIcon, TraceIcon } from './icons';

interface ReasoningNudgeProps {
  /** 当前模型的单点故障数（架构推演器的 spof:* 发现）——这就是「体检结果」。 */
  spofCount: number;
  /** 第一个单点节点的名字：用来给「点死它看谁跟着挂」的一键演示；没有单点则为 null。 */
  demoNodeName: string | null;
  onDemo: () => void;
  onSimulate: () => void;
  onTrace: () => void;
  onDismiss: () => void;
}

export function ReasoningNudge({ spofCount, demoNodeName, onDemo, onSimulate, onTrace, onDismiss }: ReasoningNudgeProps) {
  return (
    <div className="dd-nudge" role="note" aria-label="推演邀请">
      <button className="dd-nudge-x" onClick={onDismiss} title="不再提示（推演入口在节点抽屉和左导航里一直都在）" aria-label="关闭推演邀请">
        <CloseIcon size={13} />
      </button>
      <div className="dd-nudge-head">
        <span className="dd-nudge-ico">
          <FindingsIcon size={15} />
        </span>
        <strong>画完推一推，模型会顶嘴</strong>
      </div>
      <p className="dd-nudge-check">
        {spofCount > 0 ? (
          <>
            体检发现 <b className="dd-nudge-warn">{spofCount} 处单点无兜底</b>。思考是建模的质检——推一推就知道哪里不成立。
          </>
        ) : (
          <>体检：暂未发现单点故障。推一推，验证你的假设是不是真的成立。</>
        )}
      </p>
      <div className="dd-nudge-actions">
        {demoNodeName && (
          <button className="dd-nudge-btn is-demo" onClick={onDemo} title="把这个单点设为失效源，看爆炸半径">
            试一下：点死「{demoNodeName}」
          </button>
        )}
        <button className="dd-nudge-btn" onClick={onSimulate}>
          <SimulationIcon size={13} />
          模拟失效
        </button>
        <button className="dd-nudge-btn" onClick={onTrace}>
          <TraceIcon size={13} />
          追踪请求
        </button>
      </div>
    </div>
  );
}
