import { describe, expect, it } from 'vitest'
import { classifySessionTask } from './sessionTaskKind'

describe('classifySessionTask', () => {
  it('reads the responsibility instead of treating every session as a feature', () => {
    expect(classifySessionTask('登录接口怎么工作')).toBe('explore')
    expect(classifySessionTask('看看这个函数在哪')).toBe('explore')
    expect(classifySessionTask('帮我拆一下支付改造的方案')).toBe('plan')
    expect(classifySessionTask('给设置页加一个导出按钮')).toBe('build')
    expect(classifySessionTask('怎么实现登录')).toBe('build')
    expect(classifySessionTask('登录按钮点了没反应')).toBe('fix')
    expect(classifySessionTask('修复登录报错')).toBe('fix')
    expect(classifySessionTask('这个测试失败了')).toBe('fix')
    expect(classifySessionTask('修复登录页的间距')).toBe('design')
    expect(classifySessionTask('把侧栏间距和颜色收一下')).toBe('design')
    expect(classifySessionTask('帮我开一个 PR 并看 CI')).toBe('git')
    expect(classifySessionTask('提交刚才的登录功能')).toBe('build')
    expect(classifySessionTask('npm install 之后项目跑不起来')).toBe('setup')
    expect(classifySessionTask('部署到生产环境')).toBe('setup')
    expect(classifySessionTask('')).toBe('build')
  })
})