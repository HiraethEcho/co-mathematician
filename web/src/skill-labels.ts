import type { Skill } from './api';

const titles: Record<string, string> = {
  'proof-blueprint-review': '证明思路检查', 'discover-math-problems': '数学问题梳理',
  'math-paper-reading': '数学论文阅读', 'paper-to-skill': '从论文整理方法',
  'paper-writing': '论文写作', 'math-beamer': '数学报告与课件',
  'lean-setup': 'Lean 环境配置', 'lean-formalization': 'Lean 形式化',
  'linear-programming': '线性规划', 'copt-linear-program': 'COPT 线性规划',
  'mixed-integer-programming': '混合整数规划', 'second-order-cone-programming': '二阶锥规划',
  'or-solver': '选择优化求解器', 'osqp-solver': '二次规划', 'cdopt-optimization': '流形优化',
  'least-squares': '最小二乘', 'finite-element-analysis': '有限元分析',
  'invariant-computation': '不变量计算', 'scientific-computing-reproduction': '科学计算复现',
  'sagemath-skill': 'SageMath 计算', 'openevolve-experiment-workflow': '算法演化实验',
  'agent-laboratory-workflow': '自动研究流程', 'co-mathematician': 'Co-Math 项目协作',
};

export function skillTitle(skill: Pick<Skill, 'name' | 'title'>) { return titles[skill.name] || skill.title || skill.name; }

const summaries: Record<string, string> = {
  'proof-blueprint-review': '梳理命题和假设，检查证明中的缺口，并整理修正建议。',
  'discover-math-problems': '把零散想法整理成清楚的数学问题、候选猜想和下一步研究方向。',
  'math-paper-reading': '梳理论文中的定义、定理和证明关系，按需要深入阅读。',
  'paper-to-skill': '从论文中整理可以复用的方法、适用条件和操作步骤。',
  'paper-writing': '根据已有研究材料组织论文结构、论证和文字表达。',
  'math-beamer': '把已有数学内容整理成报告、讲义和课件。',
  'lean-setup': '指导配置 Lean、Lake 和数学库，明确需要执行的安装步骤。',
  'lean-formalization': '规划 Lean 形式化、定位证明问题；实际检查需要 Lean 执行环境。',
  'finite-element-analysis': '梳理网格、弱形式、离散方程和计算结果的检查步骤。',
  'least-squares': '明确拟合问题、残差和约束，选择合适的最小二乘方法。',
};
export function skillSummary(skill: Pick<Skill, 'name' | 'description'>) { return summaries[skill.name] || skill.description || ''; }
