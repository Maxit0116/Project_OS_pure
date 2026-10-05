const { createHash, createHmac } = require('node:crypto')
const { existsSync, readFileSync, realpathSync, statSync } = require('node:fs')
const { dirname, extname, relative, resolve, sep } = require('node:path')
const { parse } = require('next/dist/compiled/babel/parser')

const SOURCE_ATTRIBUTE = 'data-projectos-source-id'
const CALLSITE_ATTRIBUTE = 'data-projectos-callsite-source-id'
const CALLSITE_PROP = '__projectosCallsiteSourceId'
const SESSION_SALT_PATTERN = /^[A-Za-z0-9_-]{32,128}$/u
const VERSION = 'projectos-source-binding-v1'
const LOCAL_MODULE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs']
const STATIC_TEXT_TAGS = new Set([
  'a', 'button', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'label', 'li', 'p', 'small', 'span', 'strong', 'td', 'th',
])

module.exports = function projectOsSourceBindingPlugin({ types: t }) {
  const componentRootCache = new WeakMap()
  const callsiteBindingCache = new WeakMap()
  const consumableExportCache = new Map()

  return {
    name: 'projectos-source-binding',

    pre(file) {
      const salt = process.env.PROJECTOS_PREVIEW_SESSION_SALT
      const filename = file.opts.filename
      if (!salt || !SESSION_SALT_PATTERN.test(salt) || !filename) {
        this.projectOsSourceBinding = { enabled: false }
        return
      }

      let workspaceRoot
      let absoluteFilename
      try {
        workspaceRoot = realpathSync(resolve(file.opts.cwd || process.cwd()))
        absoluteFilename = realpathSync(resolve(filename))
      } catch {
        this.projectOsSourceBinding = { enabled: false }
        return
      }
      const relativePath = relative(workspaceRoot, absoluteFilename).split(sep).join('/')
      if (
        relativePath.length === 0 ||
        relativePath === '..' ||
        relativePath.startsWith('../') ||
        relativePath.includes('/node_modules/') ||
        relativePath.startsWith('node_modules/') ||
        relativePath.includes('/.next/') ||
        relativePath.startsWith('.next/')
      ) {
        this.projectOsSourceBinding = { enabled: false }
        return
      }

      const sourceText = file.code
      this.projectOsSourceBinding = {
        enabled: true,
        salt,
        workspaceRoot,
        absoluteFilename,
        relativePath,
        sourceText,
        sourceHash: sha256(sourceText),
        localComponentNames: new Set(),
      }
    },

    visitor: {
      Program(path, state) {
        const context = state.projectOsSourceBinding
        if (!context?.enabled) return
        for (const statement of path.get('body')) {
          if (!statement.isImportDeclaration()) continue
          const source = statement.node.source.value
          if (!isProjectLocalImport(source)) continue
          for (const specifier of statement.node.specifiers) {
            if (statement.node.importKind === 'type' || specifier.importKind === 'type') continue
            const importedName = importedComponentName(specifier, t)
            if (
              importedName &&
              componentImportConsumesCallsite(
                context,
                source,
                importedName,
                consumableExportCache,
                t,
              )
            ) {
              context.localComponentNames.add(specifier.local.name)
            }
          }
        }
      },

      JSXOpeningElement(path, state) {
        const context = state.projectOsSourceBinding
        if (!context?.enabled) return
        const name = path.node.name

        if (t.isJSXIdentifier(name) && context.localComponentNames.has(name.name)) {
          injectCallsiteProp(path, context, t)
          return
        }
        if (!isSelectableIntrinsic(path.node, t)) return

        const templateSourceId = sourceId('t', context, path.node)
        if (!templateSourceId) return
        assertReservedAttributeAbsent(path, SOURCE_ATTRIBUTE, t)
        assertReservedAttributeAbsent(path, CALLSITE_ATTRIBUTE, t)
        path.pushContainer(
          'attributes',
          t.jsxAttribute(t.jsxIdentifier(SOURCE_ATTRIBUTE), t.stringLiteral(templateSourceId)),
        )

        const functionPath = path.getFunctionParent()
        if (!functionPath) return
        const isRoot = isSupportedComponentRootPath(
          path,
          functionPath,
          componentRootCache,
          t,
        )
        const isDirectPropText = !isRoot &&
          isDirectPropTextPath(path, functionPath, componentRootCache, t)
        if (!isRoot && !isDirectPropText) return
        const callsiteBinding = cachedCallsiteBinding(
          functionPath,
          callsiteBindingCache,
          t,
        )
        if (!callsiteBinding) return
        path.pushContainer(
          'attributes',
          t.jsxAttribute(
            t.jsxIdentifier(CALLSITE_ATTRIBUTE),
            t.jsxExpressionContainer(callsiteBinding),
          ),
        )
      },
    },
  }
}

function cachedCallsiteBinding(functionPath, cache, t) {
  if (cache.has(functionPath.node)) {
    const cached = cache.get(functionPath.node)
    return cached ? t.cloneNode(cached) : undefined
  }
  const binding = ensureCallsiteBinding(functionPath, t)
  cache.set(functionPath.node, binding || null)
  return binding ? t.cloneNode(binding) : undefined
}

function isDirectPropTextPath(openingPath, functionPath, rootCache, t) {
  const name = openingPath.node.name
  if (
    !t.isJSXIdentifier(name) ||
    !STATIC_TEXT_TAGS.has(name.name) ||
    openingPath.node.attributes.some((attribute) => t.isJSXSpreadAttribute(attribute))
  ) return false
  const elementPath = openingPath.parentPath
  if (!elementPath?.isJSXElement()) return false
  const children = elementPath.node.children
  if (
    children.length !== 1 ||
    !t.isJSXExpressionContainer(children[0]) ||
    !t.isIdentifier(children[0].expression)
  ) return false
  const propName = children[0].expression.name
  const params = functionPath.node.params
  if (params.length !== 1 || !t.isObjectPattern(params[0])) return false
  const bindings = params[0].properties.filter((property) =>
    t.isObjectProperty(property) &&
    !property.computed &&
    property.shorthand &&
    t.isIdentifier(property.key, { name: propName }) &&
    t.isIdentifier(property.value, { name: propName }),
  )
  if (bindings.length !== 1) return false
  let root = rootCache.get(functionPath.node)
  if (root === undefined) {
    const roots = eligibleComponentRoots(functionPath.node, t)
    root = roots.length === 1 ? roots[0] : null
    rootCache.set(functionPath.node, root)
  }
  if (!root) return false
  let current = elementPath
  while (current && current !== functionPath) {
    if (current.isJSXElement() && current.node.openingElement === root) return true
    current = current.parentPath
  }
  return false
}

function injectCallsiteProp(path, context, t) {
  if (path.node.attributes.some((attribute) => t.isJSXSpreadAttribute(attribute))) return
  const callsiteSourceId = sourceId('c', context, path.node)
  if (!callsiteSourceId) return
  assertReservedAttributeAbsent(path, CALLSITE_PROP, t)
  path.pushContainer(
    'attributes',
    t.jsxAttribute(t.jsxIdentifier(CALLSITE_PROP), t.stringLiteral(callsiteSourceId)),
  )
}

function isSelectableIntrinsic(opening, t) {
  return t.isJSXIdentifier(opening.name) && /^[a-z]/u.test(opening.name.name)
}

function isEligibleIntrinsic(opening, t, functionNode) {
  if (!isSelectableIntrinsic(opening, t)) return false
  if (opening.attributes.some((attribute) => t.isJSXSpreadAttribute(attribute))) return false
  const style = opening.attributes.find((attribute) =>
    t.isJSXAttribute(attribute) &&
    t.isJSXIdentifier(attribute.name, { name: 'style' }),
  )
  if (!style || !t.isJSXExpressionContainer(style.value)) return false
  const expression = style.value.expression
  if (!t.isObjectExpression(expression)) return false
  if (expression.properties.every((property) => isStaticStyleProperty(property, t))) return true
  return hasTerminalDestructuredStyleSpread(expression, functionNode, t)
}

function isStaticStyleProperty(property, t) {
  return (
    t.isObjectProperty(property) &&
    !property.computed &&
    (t.isIdentifier(property.key) || t.isStringLiteral(property.key)) &&
    (t.isStringLiteral(property.value) ||
      t.isNumericLiteral(property.value) ||
      t.isBooleanLiteral(property.value))
  )
}

function isSupportedComponentRootPath(openingPath, functionPath, cache, t) {
  let root = cache.get(functionPath.node)
  if (root === undefined) {
    const roots = eligibleComponentRoots(functionPath.node, t)
    root = roots.length === 1 ? roots[0] : null
    cache.set(functionPath.node, root)
  }
  return root === openingPath.node
}

function countEligibleComponentRoots(functionNode, t) {
  return eligibleComponentRoots(functionNode, t).length
}

function eligibleComponentRoots(functionNode, t) {
  const roots = []
  if (t.isArrowFunctionExpression(functionNode) && !t.isBlockStatement(functionNode.body)) {
    const root = eligibleComponentRoot(functionNode.body, t, functionNode)
    if (root) roots.push(root)
  } else {
    collectEligibleReturnRoots(functionNode.body, roots, t, functionNode)
  }
  return roots
}

function collectEligibleReturnRoots(node, roots, t, functionNode) {
  if (!node) return
  if (t.isFunction(node)) return
  if (t.isReturnStatement(node)) {
    const root = eligibleComponentRoot(node.argument, t, functionNode)
    if (root) roots.push(root)
    return
  }
  for (const key of t.VISITOR_KEYS[node.type] || []) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const entry of child) collectEligibleReturnRoots(entry, roots, t, functionNode)
    } else {
      collectEligibleReturnRoots(child, roots, t, functionNode)
    }
  }
}

function eligibleComponentRoot(expression, t, functionNode) {
  if (t.isJSXElement(expression)) {
    return isEligibleIntrinsic(expression.openingElement, t, functionNode)
      ? expression.openingElement
      : undefined
  }
  if (!t.isJSXFragment(expression)) return undefined
  const meaningfulChildren = expression.children.filter((child) =>
    !t.isJSXText(child) || child.value.trim().length > 0,
  )
  if (meaningfulChildren.length !== 1 || !t.isJSXElement(meaningfulChildren[0])) {
    return undefined
  }
  return isEligibleIntrinsic(meaningfulChildren[0].openingElement, t, functionNode)
    ? meaningfulChildren[0].openingElement
    : undefined
}

function hasTerminalDestructuredStyleSpread(expression, functionNode, t) {
  if (!functionNode || !destructuresPlainStyleProp(functionNode, t)) return false
  const properties = expression.properties
  if (properties.length === 0) return false
  const last = properties[properties.length - 1]
  if (
    !t.isSpreadElement(last) ||
    !t.isIdentifier(last.argument, { name: 'style' })
  ) return false
  return properties.slice(0, -1).every((property) => isStaticStyleProperty(property, t))
}

function destructuresPlainStyleProp(functionNode, t) {
  const params = functionNode.params
  if (params.length !== 1 || !t.isObjectPattern(params[0])) return false
  return params[0].properties.some((property) =>
    t.isObjectProperty(property) &&
    !property.computed &&
    property.shorthand &&
    t.isIdentifier(property.key, { name: 'style' }) &&
    t.isIdentifier(property.value, { name: 'style' }),
  )
}

function ensureCallsiteBinding(functionPath, t) {
  const params = functionPath.node.params
  if (params.length === 0) {
    if (!t.isBlockStatement(functionPath.node.body)) return undefined
    const props = functionPath.scope.generateUidIdentifier('projectosProps')
    const binding = functionPath.scope.generateUidIdentifier('projectosCallsiteSourceId')
    params.push(props)
    functionPath.node.body.body.unshift(callsiteBindingDeclaration(props, binding, t))
    return binding
  }
  if (params.length !== 1) return undefined
  if (t.isIdentifier(params[0])) {
    if (!t.isBlockStatement(functionPath.node.body)) return undefined
    const binding = functionPath.scope.generateUidIdentifier('projectosCallsiteSourceId')
    functionPath.node.body.body.unshift(callsiteBindingDeclaration(params[0], binding, t))
    return binding
  }
  if (!t.isObjectPattern(params[0])) return undefined
  const pattern = params[0]
  if (pattern.properties.some((property) => t.isRestElement(property))) return undefined
  for (const property of pattern.properties) {
    if (!t.isObjectProperty(property) || property.computed) continue
    if (
      (t.isIdentifier(property.key) && property.key.name === CALLSITE_PROP) ||
      (t.isStringLiteral(property.key) && property.key.value === CALLSITE_PROP)
    ) {
      if (t.isIdentifier(property.value)) return t.cloneNode(property.value)
      if (t.isAssignmentPattern(property.value) && t.isIdentifier(property.value.left)) {
        return t.cloneNode(property.value.left)
      }
      return undefined
    }
  }
  const binding = functionPath.scope.generateUidIdentifier('projectosCallsiteSourceId')
  pattern.properties.push(
    t.objectProperty(t.identifier(CALLSITE_PROP), binding),
  )
  return binding
}

function callsiteBindingDeclaration(propsIdentifier, bindingIdentifier, t) {
  return t.variableDeclaration('var', [
    t.variableDeclarator(
      t.cloneNode(bindingIdentifier),
      t.memberExpression(t.cloneNode(propsIdentifier), t.identifier(CALLSITE_PROP)),
    ),
  ])
}

function assertReservedAttributeAbsent(path, attributeName, t) {
  const duplicate = path.node.attributes.some((attribute) =>
    t.isJSXAttribute(attribute) &&
    t.isJSXIdentifier(attribute.name, { name: attributeName }),
  )
  if (duplicate) {
    throw path.buildCodeFrameError(`Reserved ProjectOS JSX attribute '${attributeName}' is already present`)
  }
}

function sourceId(kind, context, node) {
  if (
    !Number.isInteger(node.start) ||
    !Number.isInteger(node.end) ||
    node.start < 0 ||
    node.end <= node.start ||
    node.end > context.sourceText.length
  ) return undefined
  const fingerprint = sha256(context.sourceText.slice(node.start, node.end))
  const canonical = [
    VERSION,
    kind,
    context.relativePath,
    context.sourceHash,
    String(node.start),
    String(node.end),
    fingerprint,
  ].join('\0')
  const digest = createHmac('sha256', context.salt).update(canonical, 'utf8').digest('base64url')
  return `ps1_${kind}_${digest}`
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function isProjectLocalImport(source) {
  return source.startsWith('@/') || source.startsWith('./') || source.startsWith('../')
}

function importedComponentName(specifier, t) {
  if (t.isImportDefaultSpecifier(specifier)) return 'default'
  if (!t.isImportSpecifier(specifier)) return undefined
  if (t.isIdentifier(specifier.imported)) return specifier.imported.name
  if (t.isStringLiteral(specifier.imported)) return specifier.imported.value
  return undefined
}

function componentImportConsumesCallsite(context, source, importedName, cache, t) {
  const modulePath = resolveProjectLocalModule(context, source)
  if (!modulePath) return false
  let sourceText
  try {
    sourceText = readFileSync(modulePath, 'utf8')
  } catch {
    return false
  }
  const cacheKey = `${modulePath}\0${sha256(sourceText)}`
  let consumableExports = cache.get(cacheKey)
  if (!consumableExports) {
    consumableExports = analyzeConsumableExports(sourceText, modulePath, t)
    cache.set(cacheKey, consumableExports)
  }
  return consumableExports.has(importedName)
}

function resolveProjectLocalModule(context, source) {
  const unresolved = source.startsWith('@/')
    ? resolve(context.workspaceRoot, source.slice(2))
    : resolve(dirname(context.absoluteFilename), source)
  const candidates = extname(unresolved)
    ? [unresolved]
    : [
        ...LOCAL_MODULE_EXTENSIONS.map((extension) => `${unresolved}${extension}`),
        ...LOCAL_MODULE_EXTENSIONS.map((extension) => resolve(unresolved, `index${extension}`)),
      ]
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try {
      const realWorkspaceRoot = realpathSync(context.workspaceRoot)
      const realCandidate = realpathSync(candidate)
      const relativeCandidate = relative(realWorkspaceRoot, realCandidate)
      if (
        relativeCandidate.length === 0 ||
        relativeCandidate === '..' ||
        relativeCandidate.startsWith(`..${sep}`) ||
        resolve(realWorkspaceRoot, relativeCandidate) !== realCandidate ||
        !statSync(realCandidate).isFile()
      ) continue
      return realCandidate
    } catch {
      continue
    }
  }
  return undefined
}

function analyzeConsumableExports(sourceText, filename, t) {
  let program
  try {
    program = parse(sourceText, {
      sourceFilename: filename,
      sourceType: 'unambiguous',
      plugins: ['jsx', 'typescript'],
    }).program
  } catch {
    return new Set()
  }

  const declarations = new Map()
  for (const statement of program.body) {
    registerTopLevelDeclaration(statement, declarations, t)
    if (t.isExportNamedDeclaration(statement) && statement.declaration) {
      registerTopLevelDeclaration(statement.declaration, declarations, t)
    }
  }

  const consumable = new Set()
  for (const statement of program.body) {
    if (t.isExportDefaultDeclaration(statement)) {
      const component = exportedFunction(statement.declaration, declarations, t)
      if (component && componentCanConsumeCallsite(component, t)) consumable.add('default')
      continue
    }
    if (!t.isExportNamedDeclaration(statement) || statement.exportKind === 'type') continue
    if (statement.declaration) {
      for (const [name, component] of declaredFunctions(statement.declaration, t)) {
        if (componentCanConsumeCallsite(component, t)) consumable.add(name)
      }
    }
    if (statement.source) continue
    for (const specifier of statement.specifiers) {
      if (!t.isExportSpecifier(specifier) || specifier.exportKind === 'type') continue
      const localName = nodeName(specifier.local, t)
      const exportedName = nodeName(specifier.exported, t)
      const component = localName ? declarations.get(localName) : undefined
      if (exportedName && component && componentCanConsumeCallsite(component, t)) {
        consumable.add(exportedName)
      }
    }
  }
  return consumable
}

function registerTopLevelDeclaration(statement, declarations, t) {
  for (const [name, component] of declaredFunctions(statement, t)) {
    declarations.set(name, component)
  }
}

function declaredFunctions(declaration, t) {
  const declared = []
  if (t.isFunctionDeclaration(declaration) && declaration.id) {
    declared.push([declaration.id.name, declaration])
    return declared
  }
  if (!t.isVariableDeclaration(declaration)) return declared
  for (const declarator of declaration.declarations) {
    if (!t.isIdentifier(declarator.id)) continue
    const component = exportedFunction(declarator.init, new Map(), t)
    if (component) declared.push([declarator.id.name, component])
  }
  return declared
}

function exportedFunction(value, declarations, t) {
  if (t.isFunctionDeclaration(value) || t.isFunctionExpression(value) || t.isArrowFunctionExpression(value)) {
    return value
  }
  if (t.isIdentifier(value)) return declarations.get(value.name)
  if (
    t.isTSAsExpression(value) ||
    t.isTSSatisfiesExpression(value) ||
    t.isTypeCastExpression(value) ||
    t.isParenthesizedExpression(value)
  ) return exportedFunction(value.expression, declarations, t)
  return undefined
}

function componentCanConsumeCallsite(component, t) {
  return countEligibleComponentRoots(component, t) === 1 && canEnsureCallsiteBinding(component, t)
}

function canEnsureCallsiteBinding(component, t) {
  const params = component.params
  if (params.length === 0) return t.isBlockStatement(component.body)
  if (params.length !== 1) return false
  if (t.isIdentifier(params[0])) return t.isBlockStatement(component.body)
  if (!t.isObjectPattern(params[0])) return false
  if (params[0].properties.some((property) => t.isRestElement(property))) return false
  const existing = params[0].properties.find((property) =>
    t.isObjectProperty(property) &&
    !property.computed &&
    (
      (t.isIdentifier(property.key) && property.key.name === CALLSITE_PROP) ||
      (t.isStringLiteral(property.key) && property.key.value === CALLSITE_PROP)
    ),
  )
  if (!existing) return true
  return t.isIdentifier(existing.value) ||
    (t.isAssignmentPattern(existing.value) && t.isIdentifier(existing.value.left))
}

function nodeName(node, t) {
  if (t.isIdentifier(node)) return node.name
  if (t.isStringLiteral(node)) return node.value
  return undefined
}
