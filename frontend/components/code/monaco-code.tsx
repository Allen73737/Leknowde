"use client";

import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";

const languageMap: Record<string, string> = {
  TypeScript: "typescript",
  JavaScript: "javascript",
  Go: "go",
  Python: "python",
  Rust: "rust",
  Java: "java",
  Kotlin: "kotlin",
  Ruby: "ruby",
  PHP: "php",
  "C#": "csharp",
  C: "c",
  "C++": "cpp",
  Swift: "swift",
  Scala: "scala",
  SQL: "sql",
  Markdown: "markdown",
  JSON: "json",
  YAML: "yaml",
  HTML: "html",
  CSS: "css",
  Shell: "shell",
  Protobuf: "protobuf",
  Terraform: "hcl",
  Config: "ini",
};

export function monacoLanguage(language: string): string {
  return languageMap[language] ?? "plaintext";
}

export function MonacoCode({
  value,
  language,
  path,
  height = "560px",
  focusLine,
}: {
  value: string;
  language: string;
  path: string;
  height?: string;
  focusLine?: number;
}) {
  const [theme, setTheme] = useState<"leknowde-dark" | "leknowde-light">("leknowde-dark");
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const focusRef = useRef(focusLine);

  useEffect(() => {
    focusRef.current = focusLine;
    if (focusLine && editorRef.current) {
      editorRef.current.revealLineInCenter(focusLine);
      editorRef.current.setPosition({ lineNumber: focusLine, column: 1 });
    }
  }, [focusLine]);

  useEffect(() => {
    function sync() {
      const current = document.documentElement.getAttribute("data-theme");
      setTheme(current === "light" ? "leknowde-light" : "leknowde-dark");
    }
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const beforeMount: BeforeMount = (monaco) => {
    monaco.editor.defineTheme("leknowde-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "77847B", fontStyle: "italic" },
        { token: "keyword", foreground: "A0B8A8" },
        { token: "string", foreground: "C2AA70" },
        { token: "number", foreground: "C2AA70" },
        { token: "type", foreground: "9DBBA8" },
        { token: "type.identifier", foreground: "9DBBA8" },
        { token: "identifier", foreground: "EAEDE7" },
        { token: "delimiter", foreground: "A5B0A6" },
        { token: "tag", foreground: "A0B8A8" },
        { token: "attribute.name", foreground: "C2AA70" },
      ],
      colors: {
        "editor.background": "#19211E",
        "editor.foreground": "#EAEDE7",
        "editorLineNumber.foreground": "#5E6B62",
        "editorLineNumber.activeForeground": "#A5B0A6",
        "editor.selectionBackground": "#35413B",
        "editor.inactiveSelectionBackground": "#2B3732",
        "editor.lineHighlightBackground": "#202A27",
        "editorCursor.foreground": "#A0B8A8",
        "editorIndentGuide.background1": "#26312C",
        "editorIndentGuide.activeBackground1": "#35413B",
        "editorWidget.background": "#202A27",
        "editorWidget.border": "#35413B",
        "scrollbarSlider.background": "#35413B80",
        "scrollbarSlider.hoverBackground": "#77847B80",
      },
    });
    monaco.editor.defineTheme("leknowde-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "617F6B", fontStyle: "italic" },
        { token: "keyword", foreground: "617F6B" },
        { token: "string", foreground: "8A7137" },
        { token: "number", foreground: "8A7137" },
        { token: "type", foreground: "4F7D60" },
        { token: "type.identifier", foreground: "4F7D60" },
        { token: "identifier", foreground: "18201C" },
      ],
      colors: {
        "editor.background": "#F5F6F1",
        "editor.foreground": "#18201C",
        "editorLineNumber.foreground": "#9AA89F",
        "editorLineNumber.activeForeground": "#647269",
        "editor.selectionBackground": "#DDE5DC",
        "editor.lineHighlightBackground": "#EAEDE7",
        "editorCursor.foreground": "#617F6B",
        "editorIndentGuide.background1": "#DDE5DC",
      },
    });
  };

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    if (focusRef.current) {
      editor.revealLineInCenter(focusRef.current);
      editor.setPosition({ lineNumber: focusRef.current, column: 1 });
    }
  };

  return (
    <Editor
      height={height}
      path={path}
      language={monacoLanguage(language)}
      value={value}
      theme={theme}
      beforeMount={beforeMount}
      onMount={onMount}
      loading={
        <div className="flex h-full items-center justify-center bg-shell font-mono text-[0.8125rem] text-faint">
          Loading source viewer…
        </div>
      }
      options={{
        readOnly: true,
        domReadOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: 21,
        fontFamily: "var(--font-plex-mono), IBM Plex Mono, monospace",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        renderLineHighlight: "line",
        padding: { top: 10, bottom: 10 },
        wordWrap: "off",
        automaticLayout: true,
        contextmenu: false,
        folding: true,
        glyphMargin: false,
        lineNumbersMinChars: 3,
      }}
    />
  );
}
