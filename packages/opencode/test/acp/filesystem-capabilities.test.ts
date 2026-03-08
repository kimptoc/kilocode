import { describe, expect, test } from "bun:test"
import { ACP } from "../../src/acp/agent"
import type { AgentSideConnection } from "@agentclientprotocol/sdk"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import path from "path"

type ReadTextFileParams = Parameters<AgentSideConnection["readTextFile"]>[0]
type WriteTextFileParams = Parameters<AgentSideConnection["writeTextFile"]>[0]
type ReadTextFileResult = Awaited<ReturnType<AgentSideConnection["readTextFile"]>>

function createFakeFilesystemAgent() {
  const fileOperations: Array<{ type: "read" | "write"; params: ReadTextFileParams | WriteTextFileParams }> = []
  const fileContents = new Map<string, string>()

  const connection = {
    async sessionUpdate() {
      // Mock session update - not needed for filesystem tests
    },
    async requestPermission() {
      return { outcome: { outcome: "selected", optionId: "once" } }
    },
    async readTextFile(params: ReadTextFileParams): Promise<ReadTextFileResult> {
      fileOperations.push({ type: "read", params })
      const content = fileContents.get(params.path)
      if (content === undefined) {
        throw new Error(`File not found: ${params.path}`)
      }
      return { content }
    },
    async writeTextFile(params: WriteTextFileParams): Promise<void> {
      fileOperations.push({ type: "write", params })
      fileContents.set(params.path, params.content)
    },
  } as unknown as AgentSideConnection

  const sessions = new Map<string, { cwd: string }>()

  const sessionManager = {
    sessions,
    create: (cwd: string) => {
      const sessionId = `ses_${Date.now()}`
      const session = { id: sessionId, cwd }
      sessions.set(sessionId, { cwd })
      return session
    },
    get: (sessionId: string) => {
      const session = sessions.get(sessionId)
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      return session
    },
  }

  const sdk = {
    session: {
      create: async () => {
        return {
          data: {
            id: `ses_${Date.now()}`,
            time: { created: new Date().toISOString() },
          },
        }
      },
    },
    config: {
      providers: async () => {
        return {
          data: {
            providers: [
              {
                id: "opencode",
                name: "opencode",
                models: {
                  "test-model": { id: "test-model", name: "test-model" },
                },
              },
            ],
          },
        }
      },
    },
  } as any

  const agent = new ACP.Agent(connection, {
    sdk,
    defaultModel: { providerID: "opencode", modelID: "test-model" },
  } as any)

  // Mock the session manager
  ;(agent as any).sessionManager = sessionManager

  return { agent, fileOperations, fileContents, connection, sessions }
}

describe("acp.agent filesystem capabilities", () => {
  test("initialize advertises filesystem capabilities", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent } = createFakeFilesystemAgent()

        const result = await agent.initialize({
          protocolVersion: 1,
          clientInfo: { name: "test", version: "1.0" },
          clientCapabilities: {
            fs: {
              readTextFile: true,
              writeTextFile: true,
            },
          },
        })

        expect(result.agentCapabilities).toBeDefined()
        expect(result.agentCapabilities.fsCapabilities).toBeDefined()
        expect(result.agentCapabilities.fsCapabilities.readTextFile).toBe(true)
        expect(result.agentCapabilities.fsCapabilities.writeTextFile).toBe(true)
      },
    })
  })

  test("readTextFile calls AgentSideConnection.readTextFile with correct parameters", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, fileOperations, fileContents, sessions } = createFakeFilesystemAgent()

        const sessionId = "test-session"
        const filePath = "/tmp/test-file.txt"
        const fileContent = "Hello, ACP filesystem!"

        // Setup test file
        fileContents.set(filePath, fileContent)

        // Mock session
        sessions.set(sessionId, { cwd: "/tmp" })

        const result = await agent.readTextFile({
          sessionId,
          path: filePath,
        })

        expect(result.content).toBe(fileContent)
        expect(fileOperations).toHaveLength(1)
        expect(fileOperations[0].type).toBe("read")
        expect(fileOperations[0].params).toEqual({
          sessionId,
          path: filePath,
        })
      },
    })
  })

  test("readTextFile throws error when session not found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent } = createFakeFilesystemAgent()

        await expect(
          agent.readTextFile({
            sessionId: "nonexistent-session",
            path: "/tmp/test.txt",
          }),
        ).rejects.toThrow("Session not found: nonexistent-session")
      },
    })
  })

  test("readTextFile propagates file system errors", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, sessions } = createFakeFilesystemAgent()

        const sessionId = "test-session"
        const filePath = "/tmp/nonexistent-file.txt"

        // Mock session
        sessions.set(sessionId, { cwd: "/tmp" })

        await expect(
          agent.readTextFile({
            sessionId,
            path: filePath,
          }),
        ).rejects.toThrow("File not found: /tmp/nonexistent-file.txt")
      },
    })
  })

  test("writeTextFile calls AgentSideConnection.writeTextFile with correct parameters", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, fileOperations, fileContents, sessions } = createFakeFilesystemAgent()

        const sessionId = "test-session"
        const filePath = "/tmp/output.txt"
        const content = "Content written by ACP"

        // Mock session
        sessions.set(sessionId, { cwd: "/tmp" })

        const result = await agent.writeTextFile({
          sessionId,
          path: filePath,
          content,
        })

        expect(result).toEqual({}) // ACP convention for successful write
        expect(fileContents.get(filePath)).toBe(content)
        expect(fileOperations).toHaveLength(1)
        expect(fileOperations[0].type).toBe("write")
        expect(fileOperations[0].params).toEqual({
          sessionId,
          path: filePath,
          content,
        })
      },
    })
  })

  test("writeTextFile throws error when session not found", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent } = createFakeFilesystemAgent()

        await expect(
          agent.writeTextFile({
            sessionId: "nonexistent-session",
            path: "/tmp/test.txt",
            content: "test content",
          }),
        ).rejects.toThrow("Session not found: nonexistent-session")
      },
    })
  })

  test("filesystem methods work with different session contexts", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, fileOperations, fileContents, sessions } = createFakeFilesystemAgent()

        const sessionA = "session-a"
        const sessionB = "session-b"
        const fileA = "/project-a/file.txt"
        const fileB = "/project-b/file.txt"
        const contentA = "Content from session A"
        const contentB = "Content from session B"

        // Mock sessions with different working directories
        sessions.set(sessionA, { cwd: "/project-a" })
        sessions.set(sessionB, { cwd: "/project-b" })

        // Write files from different sessions
        await agent.writeTextFile({ sessionId: sessionA, path: fileA, content: contentA })
        await agent.writeTextFile({ sessionId: sessionB, path: fileB, content: contentB })

        // Read files from different sessions
        const resultA = await agent.readTextFile({ sessionId: sessionA, path: fileA })
        const resultB = await agent.readTextFile({ sessionId: sessionB, path: fileB })

        expect(resultA.content).toBe(contentA)
        expect(resultB.content).toBe(contentB)
        expect(fileOperations).toHaveLength(4) // 2 writes + 2 reads

        // Verify session isolation in operations
        const sessionAOps = fileOperations.filter((op) => (op.params as any).sessionId === sessionA)
        const sessionBOps = fileOperations.filter((op) => (op.params as any).sessionId === sessionB)
        expect(sessionAOps).toHaveLength(2)
        expect(sessionBOps).toHaveLength(2)
      },
    })
  })

  test("filesystem operations handle empty content correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, fileContents, sessions } = createFakeFilesystemAgent()

        const sessionId = "test-session"
        const filePath = "/tmp/empty.txt"
        const emptyContent = ""

        // Mock session
        sessions.set(sessionId, { cwd: "/tmp" })

        // Write empty content
        await agent.writeTextFile({ sessionId, path: filePath, content: emptyContent })

        // Read back empty content
        const result = await agent.readTextFile({ sessionId, path: filePath })

        expect(result.content).toBe("")
        expect(fileContents.get(filePath)).toBe("")
      },
    })
  })

  test("filesystem operations handle large content correctly", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, fileContents, sessions } = createFakeFilesystemAgent()

        const sessionId = "test-session"
        const filePath = "/tmp/large.txt"
        const largeContent = "A".repeat(10000) // 10KB of 'A's

        // Mock session
        sessions.set(sessionId, { cwd: "/tmp" })

        // Write large content
        await agent.writeTextFile({ sessionId, path: filePath, content: largeContent })

        // Read back large content
        const result = await agent.readTextFile({ sessionId, path: filePath })

        expect(result.content).toBe(largeContent)
        expect(result.content).toHaveLength(10000)
        expect(fileContents.get(filePath)).toBe(largeContent)
      },
    })
  })

  test("filesystem operations handle special characters and unicode", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const { agent, fileContents, sessions } = createFakeFilesystemAgent()

        const sessionId = "test-session"
        const filePath = "/tmp/unicode.txt"
        const unicodeContent = "Hello 世界! 🚀 Emoji and unicode: αβγδε"

        // Mock session
        sessions.set(sessionId, { cwd: "/tmp" })

        // Write unicode content
        await agent.writeTextFile({ sessionId, path: filePath, content: unicodeContent })

        // Read back unicode content
        const result = await agent.readTextFile({ sessionId, path: filePath })

        expect(result.content).toBe(unicodeContent)
        expect(fileContents.get(filePath)).toBe(unicodeContent)
      },
    })
  })
})
