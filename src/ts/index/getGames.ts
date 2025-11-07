import axios from 'axios';

export interface KLine {
    time: number;
    open: number;
    close: number;
    high: number;
    low: number;
    //当天对局数
    gameCount?: number;
    //当天胜负和局数
    winLoseDrawCount?: {
        winCount: number;
        loseCount: number;
        drawCount: number;
    };
}

export interface RawGame {
    id: string;
    createdAt: number;
    perf: string;
    players: {
        white: {
            user: {
                name?: string,
                id?:string
            };
            rating: number;
            ratingDiff: number
        };
        black: { user: { name?: string, id?:string }; rating: number; ratingDiff: number };
    };
    winner?: 'white' | 'black';
    status: 'mate' | 'resign' | 'draw' | 'stalemate' | 'outoftime' | 'aborted';
}

/**流式拉取指定用户和类型的游戏对局*/
export async function* streamUserGames(
    username: string,
    perf: 'bullet' | 'blitz' | 'rapid' | 'classical',
    max = 100_000
): AsyncGenerator<RawGame, void, unknown> {
    const { data } = await axios.get<NodeJS.ReadableStream>
    (
    `https://lichess.org/api/games/user/${username}`,
        {
            params: { rated: true, perfType: perf, max, moves: false },
            responseType: 'stream',
            headers: { Accept: 'application/x-ndjson' },
        }
    );

    let buffer:string = '';
    for await (const chunk of data) {
        buffer += chunk.toString();
        const lines:string[] = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines) {
            if (!line.trim()) continue;
            yield JSON.parse(line) as RawGame;//逐个返回
        }
    }
}

/**将游戏数据转换为k线数据*/
export function gamesToKLines(games: RawGame[], username: string): KLine[] {
    games.sort((a, b) => a.createdAt - b.createdAt);//将对局根据时间戳进行排序
    const dayMap = new Map<number, {
        ratings: number[];
        result: { victory: number; defeat: number; draw: number };
    }>();

    {
        function isWhite(whitePlayer:{ user: { name?: string, id?:string }; rating: number; ratingDiff: number }): boolean {
            const whiteName:string|undefined = whitePlayer.user.name || whitePlayer.user.id;
            if (whiteName) {
                return whiteName.toLowerCase() === username.toLowerCase();
            }else{
                throw new Error("data error");
            }
        }

        //将rating录入
        for (const game of games) {
            const isWhite_:boolean = isWhite(game.players.white);
            const playerData = isWhite_ ? game.players.white : game.players.black;
            const newRating: number = playerData.rating + playerData.ratingDiff;

            const day = new Date(game.createdAt);
            day.setUTCHours(0, 0, 0, 0);//统一过滤到“天”，用于分类每天的棋局
            const timeNum: number = day.getTime();
            //console.log(`number: ${day.getTime()} ${game.createdAt}`);

            if (!Number.isNaN(newRating)) {
                const dayData:{
                    ratings: number[];
                    result: {
                        victory: number;
                        defeat: number;
                        draw: number;
                    }
                } = dayMap.get(timeNum) || { ratings: [], result: { victory: 0, defeat: 0, draw: 0 } };//获取当天已录入的数据，没有则新建

                if (dayData.ratings.length == 0) {
                    dayData.ratings.push(playerData.rating);//将当天的初始rating第一个录入，以至于和前一天的收尾分一致
                }
                dayData.ratings.push(newRating);

                //判断胜负数量
                if (game.status === 'draw' || game.status === 'stalemate')
                    dayData.result.draw++;
                else if (game.winner) {
                    if ((game.winner === 'white' && isWhite_) || (game.winner === 'black' && !isWhite_))
                        dayData.result.victory++;
                    else
                        dayData.result.defeat++;
                }

                dayMap.set(timeNum, dayData);//录入
            }
        }
    }

    if (dayMap.size === 0) return [];

    //所有日期
    const dates = Array.from(dayMap.keys()).sort((a, b) => a - b);
    const startDate = new Date(dates[0]);//开始日期
    const endDate = new Date(dates[dates.length - 1]);//结束日期

    const klines: KLine[] = [];
    let lastClose: number = 0;

    for (
        let date = new Date(startDate);
        date.getTime() <= endDate.getTime();
        date.setDate(date.getDate() + 1)//遍历每一天
    ) {
        const timeNum = date.getTime();
        const dayData = dayMap.get(timeNum);

        if (dayData) {
            //当天如果有数据
            const kline:KLine = {
                time: timeNum / 1000,
                open: dayData.ratings[0],
                close: dayData.ratings[dayData.ratings.length - 1],
                high: Math.max(...dayData.ratings),
                low: Math.min(...dayData.ratings),

                gameCount: dayData.ratings.length,
                winLoseDrawCount:{
                    winCount:dayData.result.victory,
                    loseCount:dayData.result.defeat,
                    drawCount:dayData.result.draw,
                }
            };
            //console.log('kline', kline);
            //console.log('dayData', dayData);
            klines.push(kline);
            lastClose = kline.close;//记录收尾等级分
        }
        else {
            //空白日期使用上次的收尾等级分
            klines.push({
                time: timeNum / 1000,
                open: lastClose,
                close: lastClose,
                high: lastClose,
                low: lastClose,
            });
        }
    }

    return klines;
}