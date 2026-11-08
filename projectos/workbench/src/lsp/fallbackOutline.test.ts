import { describe, expect, it } from 'vitest'
import type { DocumentSymbolItem } from '@contracts/index'
import { fallbackOutline, isServedByLanguageServer } from './fallbackOutline'

const flat = (items: DocumentSymbolItem[], depth = 0): string[] =>
  items.flatMap((item) => [`${'  '.repeat(depth)}${item.kind}:${item.name}@${item.startLine}-${item.endLine}`, ...flat(item.children, depth + 1)])

describe('an outline for languages the language server does not cover', () => {
  it('reads Python classes, methods and functions, and leaves nested helpers out', () => {
    const source = [
      'import os',                         // 1
      '',                                  // 2
      'class Parser(Base):',               // 3
      '    def __init__(self, text):',     // 4
      '        self.text = text',          // 5
      '',                                  // 6
      '    async def parse(self):',        // 7
      '        def helper(x):',            // 8
      '            return x',              // 9
      '        return helper(self.text)',  // 10
      '',                                  // 11
      'def chunked(iterable, n):',         // 12
      '    return iterable',               // 13
    ].join('\n')
    expect(flat(fallbackOutline('lib/more.py', source))).toEqual([
      'class:Parser@3-10',
      '  method:__init__@4-5',
      '  method:parse@7-10',
      'function:chunked@12-13',
    ])
  })

  it('reads Java types and methods, and does not mistake control statements for methods', () => {
    const source = [
      'package org.example;',                                                // 1
      '@Entity',                                                             // 2
      'public class Owner extends Person {',                                 // 3
      '    @OneToMany',                                                      // 4
      '    private final List<Pet> pets = new ArrayList<>();',               // 5
      '',                                                                    // 6
      '    public List<Pet> getPets() {',                                    // 7
      '        if (pets == null) {',                                         // 8
      '            return List.of();',                                       // 9
      '        }',                                                           // 10
      '        return pets;',                                                // 11
      '    }',                                                               // 12
      '',                                                                    // 13
      '    public void addPet(Pet pet) {',                                   // 14
      '        for (Pet p : pets) { }',                                      // 15
      '    }',                                                               // 16
      '}',                                                                   // 17
      'interface Visits { void add(Visit v); }',                             // 18
    ].join('\n')
    const names = flat(fallbackOutline('src/Owner.java', source))
    expect(names).toContain('class:Owner@3-17')
    expect(names).toContain('  method:getPets@7-12')
    expect(names).toContain('  method:addPet@14-16')
    expect(names.some((entry) => /:(if|for|return)@/u.test(entry))).toBe(false)
    expect(names.some((entry) => entry.startsWith('interface:Visits'))).toBe(true)
  })

  it('reads Kotlin, Go, Rust, Ruby and PHP declarations', () => {
    expect(flat(fallbackOutline('A.kt', 'class Repo {\n    fun load(id: Int): Item {\n        return x\n    }\n}\n'))).toEqual([
      'class:Repo@1-5',
      '  method:load@2-4',
    ])
    expect(flat(fallbackOutline('main.go', 'package main\n\ntype Server struct {\n\tport int\n}\n\nfunc (s *Server) Start() error {\n\treturn nil\n}\n\nfunc main() {\n}\n'))).toEqual([
      'struct:Server@3-5',
      'method:Server.Start@7-9',
      'function:main@11-12',
    ])
    expect(flat(fallbackOutline('lib.rs', 'pub struct Config {\n    pub a: u8,\n}\n\nimpl Config {\n    pub fn new() -> Self {\n        Config { a: 1 }\n    }\n}\n\npub fn run() {}\n'))).toEqual([
      'struct:Config@1-3',
      'class:impl Config@5-9',
      '  method:new@6-8',
      'function:run@11-11',
    ])
    expect(flat(fallbackOutline('a.rb', 'module Shop\n  class Cart\n    def total\n      1\n    end\n  end\nend\n'))).toEqual([
      'module:Shop@1-7',
      '  class:Cart@2-6',
      '    method:total@3-5',
    ])
    expect(flat(fallbackOutline('a.php', '<?php\nclass Cart {\n    public function total() {\n        return 1;\n    }\n}\n'))).toEqual([
      'class:Cart@2-6',
      '  method:total@3-5',
    ])
  })

  it('returns nothing for text it does not understand, rather than failing', () => {
    expect(fallbackOutline('notes.txt', 'class Not real')).toEqual([])
    expect(fallbackOutline('empty.py', '')).toEqual([])
    expect(fallbackOutline('weird.java', '}}}}{{{{((( ;;;')).toEqual([])
  })

  it('stays out of the way of the languages the language server handles', () => {
    for (const path of ['a.ts', 'b.tsx', 'c.js', 'd.mjs']) expect(isServedByLanguageServer(path)).toBe(true)
    for (const path of ['a.py', 'b.java', 'c.go', 'Makefile']) expect(isServedByLanguageServer(path)).toBe(false)
  })
})
