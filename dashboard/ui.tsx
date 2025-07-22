import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import WebSocket from 'ws'

const App = () => {
    const [stats, setStats] = useState<any>({})
    const [logs, setLogs] = useState<any>([])
    const [crimsonChatStatus, setCrimsonChatStatus] = useState<any>({})
    const [operations, setOperations] = useState<any>([])
    const [latestAwacsEvent, setLatestAwacsEvent] = useState('')

    useEffect(() => {
        const ws = new WebSocket('ws://localhost:8080')

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data as string)

            switch (message.type) {
                case 'stats':
                    setStats(message.payload)
                    break
                case 'crimsonchat_status':
                    setCrimsonChatStatus(message.payload)
                    break
                case 'operations_update':
                    setOperations(message.payload)
                    break
                case 'awacs_event':
                    setLatestAwacsEvent(message.payload.message)
                    break
                case 'log':
                    setLogs((prevLogs: any) => [message.payload, ...prevLogs].slice(0, 50))
                    break
            }
        }

        return () => {
            ws.close()
        }
    }, [])

    return (
        <Box borderStyle="round" flexDirection="column">
            <Text>Crimson One Dashboard</Text>
            <Box>
                <Box borderStyle="round" flexDirection="column" width="50%">
                    <Text>System Status</Text>
                    <Text>Memory: {stats.memory ? `${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)}MB` : 'N/A'}</Text>
                    <Text>Uptime: {stats.uptime ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m ${stats.uptime % 60}s` : 'N/A'}</Text>
                    <Text>Guilds: {stats.guilds ?? 'N/A'}</Text>
                    <Text>Users: {stats.users ?? 'N/A'}</Text>
                </Box>
                <Box borderStyle="round" flexDirection="column" width="50%">
                    <Text>CrimsonChat AI</Text>
                    <Text>Status: {crimsonChatStatus.enabled ? 'ENABLED' : 'DISABLED'}</Text>
                    <Text>Model: {crimsonChatStatus.model}</Text>
                    <Text>History: {crimsonChatStatus.history ? `${crimsonChatStatus.history.count} / ${crimsonChatStatus.history.limit} ${crimsonChatStatus.history.mode}` : 'N/A'}</Text>
                    <Text>Modes: {crimsonChatStatus.modes ? crimsonChatStatus.modes.join(', ') : 'N/A'}</Text>
                </Box>
            </Box>
            <Box>
                <Box borderStyle="round" flexDirection="column" width="50%">
                    <Text>Ongoing Operations</Text>
                    {operations.map((op: any) => (
                        <Text key={op.id}>{op.name}</Text>
                    ))}
                </Box>
                <Box borderStyle="round" flexDirection="column" width="50%">
                    <Text>AWACS Feed</Text>
                    <Text>{latestAwacsEvent}</Text>
                </Box>
            </Box>
            <Box borderStyle="round" flexDirection="column">
                <Text>Live Log Stream</Text>
                {logs.map((log: any, i: number) => (
                    <Text key={i}>[{log.level}] {log.module ? `[${log.module}]` : ''} {log.message}</Text>
                ))}
            </Box>
        </Box>
    )
}

render(<App />)
