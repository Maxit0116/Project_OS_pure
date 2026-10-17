import { describe, expect, it } from 'vitest'
import {
  isSpatialPinSnapshotAttachment,
  parseSpatialPinChatContent,
  spatialPinSnapshotPath,
} from './spatialPinChatDisplay'

const sample = [
  '111',
  '',
  '[Spatial pin on workspace · spatial://workspace/%2FUsers%2Fterran%2FProjects%2FCouple_Recording · app=Cursor · device=other · inferredPath=android/ · workspace=/Users/terran/Projects/Couple_Recording · hint=Repo marker → android/ · snapshot=.projectos/spatial-pins/assets/pin_c8acv3qn.png · rect=659,636 100x90 · arrow=#1 color=#4c7dff anchor=bottomRight head=1.00,1.00 tail=2.14,-0.05]',
].join('\n')

describe('parseSpatialPinChatContent', () => {
  it('keeps only the prompt the user typed', () => {
    expect(parseSpatialPinChatContent(sample)).toEqual({ prompt: '111' })
  })

  it('leaves ordinary chat text alone', () => {
    expect(parseSpatialPinChatContent('Fix the login button')).toBeNull()
  })

  it('reads the region snapshot from the attachment, then the bracket', () => {
    expect(
      spatialPinSnapshotPath({
        content: sample,
        attachments: [
          {
            id: 'att_pin_snapshot',
            label: 'Spatial Pin snapshot',
            ref: {
              kind: 'file',
              path: '.projectos/spatial-pins/assets/pin_c8acv3qn.png',
            },
          },
        ],
      }),
    ).toBe('.projectos/spatial-pins/assets/pin_c8acv3qn.png')
    expect(spatialPinSnapshotPath({ content: sample })).toBe(
      '.projectos/spatial-pins/assets/pin_c8acv3qn.png',
    )
    expect(
      isSpatialPinSnapshotAttachment({
        id: 'att',
        label: 'Spatial Pin snapshot',
        ref: { kind: 'file', path: '.projectos/spatial-pins/assets/pin.png' },
      }),
    ).toBe(true)
  })
})
