--
-- This is file `microtype.lua',
-- generated with the docstrip utility.
--
-- The original source files were:
--
-- microtype.dtx  (with options: `luafile')
-- 
-- ------------------------------------------------------------------------
-- 
--                       The `microtype' package
--         Subliminal refinements towards typographical perfection
--           Copyright (c) 2004--2026 R Schlicht <w.m.l@gmx.net>
-- 
-- This work may be distributed and/or modified under the conditions of the
-- LaTeX Project Public License, either version 1.3c of this license or (at
-- your option) any later version. The latest version of this license is in:
-- https://www.latex-project.org/lppl.txt, and version 1.3c or later is part
-- of all distributions of LaTeX version 2005/12/01 or later.
-- 
-- This work has the LPPL maintenance status `maintained'.
-- 
-- This work consists of the files microtype.dtx, microtype-utf.dtx and
-- microtype.ins and the derived files microtype.sty, microtype-pdftex.def,
-- microtype-luatex.def, microtype-xetex.def, microtype.lua, letterspace.sty
-- and microtype-show.sty.
-- 
-- ------------------------------------------------------------------------
--   This file contains auxiliary lua functions.
--   It was originally contributed by Elie Roux <elie.roux{at}telecom-bretagne.eu>.
--   (Bugs are mine.)
-- ------------------------------------------------------------------------ 
--
microtype        = microtype or {}
local microtype  = microtype
microtype.module = {
    name         = "microtype",
    version      = "3.2d",
    date         = "2026/03/01",
    description  = "microtype module.",
    author       = "E. Roux, R. Schlicht and P. Gesang",
    copyright    = "E. Roux, R. Schlicht and P. Gesang",
    license      = "LPPL",
}
luatexbase.provides_module(microtype.module)

function microtype.info(...)
  luatexbase.module_info("microtype",...)
end

local find       = string.find
local match      = string.match
local gsub       = string.gsub
local tex_write  = tex.write

local catpackage
if luatexbase.registernumber then
  catpackage = luatexbase.registernumber("catcodetable@atletter") -- LaTeX
else
  catpackage = luatexbase.catcodetables.CatcodeTableLaTeXAtLetter -- luatexbase
end
function microtype.sprint (...)
  tex.sprint(catpackage, ...)
end

if not math.tointeger or not pcall(math.tointeger,0) then
  math.mininteger=-0x4FFFFFFFFFFF
  math.maxinteger=0x4FFFFFFFFFFF
  local floor=math.floor
  function math.tointeger(n)
    local f=floor(n)
    return f==n and f or nil
  end
end

local function if_int(s)
  if find(s,"^-*[0-9]+ *$") then
    tex_write("@firstoftwo")
  else
    tex_write("@secondoftwo")
  end
end
microtype.if_int = if_int

local function if_dimen(s)
  if (find(s, "^-*[0-9]+(%a*) *$") or
      find(s, "^-*[0-9]*[.,][0-9]+(%a*) *$")) then
    tex_write("@firstoftwo")
  else
    tex_write("@secondoftwo")
  end
end
microtype.if_dimen = if_dimen

local function if_str_eq(s1, s2)
  if s1 == s2 then
    tex_write("@firstoftwo")
  else
    tex_write("@secondoftwo")
  end
end
microtype.if_str_eq = if_str_eq

local function if_opentype_font()
  local thefont = font.getfont(font.current())
  if thefont and ( thefont.format == "opentype" or thefont.format == "truetype" )
    then tex.write("@firstoftwo")
    else tex.write("@secondoftwo")
  end
end
microtype.if_opentype_font = if_opentype_font

local function do_font()
  local thefont = font.getfont(font.current())
  if thefont then
    for i,v in next,thefont.characters do
      if v.index == nil or ( v.index > 0 and i < 1114112 ) then
        microtype.sprint([[\@tempcnta=]]..i..[[\relax\MT@dofont@function]])
      end
    end
  end
end
microtype.do_font = do_font

local function add_ls(k,feat)
  local f = tex.fontname(font.current())
  local spec,size = match(f,'^(.+)( at .+)$')
  if not spec then spec = f end
  spec = gsub(spec,"kernfactor=[-]?%d+%.%d+;","")
  local q = match(spec,'^"') or ""
  local a,b,c = match(spec,'^'..q..'([^:]+):?([^:]*):?(.*)'..q..'$')
  local ls = "kernfactor=" .. k/1000 .. ';'
  microtype.sprint(q..a..':')
  if (a == "name" or a == "file") then
    microtype.sprint(b..':'..ls..c..feat..q)
  else
    microtype.sprint(ls..b..feat..q)
  end
  if size then
    microtype.sprint(size)
  end
end
microtype.add_ls = add_ls

microtype.ligs = microtype.ligs or { }

local function noligatures(fontcs,liga)
  local fontcs = match(fontcs,"([^ ]+)")
  microtype.ligs[fontcs] = microtype.ligs[fontcs] or { }
  table.insert(microtype.ligs[fontcs],liga)
end
microtype.noligatures = noligatures

local function keepligature(c)
  local nodedirect = node.direct
  local getfield   = nodedirect.getfield
  local getfont    = nodedirect.getfont
  local f,ch
  if type(c) == "userdata" then -- in older luaotfload versions, c was a node
    f  = c.font
    ch = c.components.char
  else                          -- since 2.6, c is a (direct node) number
    f  = getfont(c)
    ch = getfield(getfield(c,"components"),"char")
  end
--  if ch then -- should always be true
  local ligs = microtype.ligs[match(tex.fontidentifier(f),"\\([^ ]+)")]
  if ligs then
    for _,lig in pairs(ligs) do
      if lig == "_all_" or tonumber(lig) == ch then
        return false
      end
    end
  end
  return true
--  end
end

if luaotfload and luaotfload.letterspace then
  if luaotfload.letterspace.keepligature then
    microtype.info("overwriting function `keepligature'")
  end
  luaotfload.letterspace.keepligature = keepligature
end

if luaotfload and luaotfload.aux and luaotfload.aux.slot_of_name then
  local slot_of_name = luaotfload.aux.slot_of_name
  microtype.name_to_slot = function(name, unsafe)
    local n = slot_of_name(font.current(), name, unsafe)
    if not n then return -1 end
    if n > 1114111 then return -1 end
    return math.tointeger(n)
  end
else
  -- we dig into internal structure (should be avoided)
  local function name_to_slot(name, unsafe)
    if fonts then
      local unicodes
      if fonts.ids then       -- legacy luaotfload
        local tfmdata = fonts.ids[font.current()]
        if not tfmdata then return end
        unicodes = tfmdata.shared.otfdata.luatex.unicodes
      else                    -- new location
        local tfmdata = fonts.hashes.identifiers[font.current()]
        if not tfmdata then return end
        unicodes = tfmdata.resources.unicodes
      end
      local unicode = unicodes[name]
      if unicode then -- does the 'or' branch actually exist?
        return type(unicode) == "number" and unicode or unicode[1]
      end
    end
  end
  microtype.name_to_slot = name_to_slot
end

-- 
--
-- End of file `microtype.lua'.
