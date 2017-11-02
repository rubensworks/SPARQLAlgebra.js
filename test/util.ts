
import _ = require('lodash');
import assert = require('assert');
import * as A from '../lib/algebra';
import translate = require('../lib/sparqlAlgebra');
const Algebra = A.types;

class Util
{
    static Algebra = Algebra;
    static translate = translate;

    static algebraElement (key: string, args: any[]) : A.Operator
    {
        switch (key)
        {
            case Algebra.BGP:       return <A.Bgp>      { type: key, patterns: args };
            case Algebra.DISTINCT:  return <A.Distinct> { type: key, input: args[0] };
            case Algebra.EXTEND:    return <A.Extend>   { type: key, input: args[0], variable: args[1], expression: args[2] };
            case Algebra.FILTER:    return <A.Filter>   { type: key, expression: args[0], input: args[1] };
            case Algebra.GRAPH:     return <A.Graph>    { type: key, graph: args[0], input: args[1] };
            case Algebra.GROUP:     return <A.Group>    { type: key, variables: args[0], aggregates: args[1], input: args[2] };
            case Algebra.JOIN:      return <A.Join>     { type: key, left: args[0], right: args[1] };
            case Algebra.LEFT_JOIN: return args[2] === true ?
                                           <A.LeftJoin> { type: key, left: args[0], right: args[1] } :
                                           <A.LeftJoin> { type: key, left: args[0], right: args[1], expression: args[2] };
            case Algebra.MINUS:     return <A.Minus>    { type: key, left: args[0], right: args[1] };
            case Algebra.ORDER_BY:  return <A.OrderBy>  { type: key, input: args[0], expressions: args[1] };
            case Algebra.PROJECT:   return <A.Project>  { type: key, input: args[0], variables: args[1] };
            case Algebra.REDUCED:   return <A.Reduced>  { type: key, input: args[0] };
            case Algebra.SLICE:     return args[1] === -1 ?
                                           <A.Slice>    { type: key, input: args[2], start: args[0] } :
                                           <A.Slice>    { type: key, input: args[2], start: args[0], length: args[1] };
            case Algebra.TRIPLE:    return <A.Triple>   { type: key, subject: args[0], predicate: args[1], object: args[2] };
            case Algebra.UNION:     return <A.Union>    { type: key, left: args[0], right: args[1] };

            case Algebra.ALT:               return <A.Alt>              { type: key, left: args[0], right: args[1] };
            case Algebra.INV:               return <A.Inv>              { type: key, path: args[0] };
            case Algebra.LINK:              return <A.Link>             { type: key, iri: args[0] };
            case Algebra.NPS:               return <A.Nps>              { type: key, iris: args };
            case Algebra.ONE_OR_MORE_PATH:  return <A.OneOrMorePath>    { type: key, path: args[0] };
            case Algebra.PATH:              return <A.Path>             { type: key, subject: args[0], predicate: args[1], object: args[2] };
            case Algebra.SEQ:               return <A.Seq>              { type: key, left: args[0], right: args[1] };
            case Algebra.ZERO_OR_ONE_PATH:  return <A.ZeroOrOnePath>    { type: key, path: args[0] };
            case Algebra.ZERO_OR_MORE_PATH: return <A.ZeroOrMorePath>   { type: key, path: args[0] };
        }

        if (key === Algebra.TABLE)
        {
            let variables: string[] = args[0].args;
            let bindings: any[] = [];
            for (let i = 1; i < args.length; ++i)
            {
                let binding: any = {};
                let row = args[i].args;
                for (let entry of row)
                    binding[entry[0]] = entry[1];
                bindings.push(binding);
            }
            return <A.Values> { type: Algebra.VALUES, variables, bindings };
        }
        
        if (key === Algebra.AGGREGATE)
        {
            let result: A.Aggregate = { type: 'aggregate', symbol: args[0], expression: args[1] };
            if (result.symbol === 'group_concat')
            {
                if (args.length === 4)
                {
                    result.separator = args[2];
                    (<A.BoundAggregate>result).variable = args[3];
                }
                else if (args[2][0] === '?')
                    (<A.BoundAggregate>result).variable = args[2];
                else
                    result.separator = args[2];
            }
            else if (args.length === 3)
                (<A.BoundAggregate>result).variable = args[2];
            
            return result;
        }

        // not returned -> probably expression
        return <A.Expression>{ type: Algebra.EXPRESSION, symbol: key, args};
    }
    
    static triple (subject: string, predicate: string, object: string)
    {
        return Util.algebraElement(Algebra.TRIPLE, [ subject, predicate, object ]);
    }
    
    static compareAlgebras (expected: A.Operator, actual: A.Operator) : boolean
    {
        let result = Util._compareAlgebrasRecursive(expected, actual, {});
        if (!result)
            assert.deepEqual(actual, expected);
        return result;
    }
    
    static _compareAlgebrasRecursive (a1: any, a2: any, blanks: any): boolean
    {
        if (_.isString(a1) || _.isSymbol(a1) || _.isBoolean(a1) || _.isInteger(a2))
        {
            if (_.isString(a1) && (a1.startsWith('_:') || a1.startsWith('?')))
            {
                if (a2[0] !== a1[0])
                    return false;
                if (blanks[a1])
                    return blanks[a1] === a2;

                blanks[a1] = a2;
                return true;
            }

            return a1 === a2;
        }
        
        if (_.isArray(a1))
        {
            if (!_.isArray(a2) || a1.length !== a2.length)
                return false;
            
            if (a1.length === 0)
                return true;
            for (let i = 0; i < a2.length; ++i)
            {
                let newBlanks = _.clone(blanks);
                let match = Util._compareAlgebrasRecursive(a1[0], a2[i], newBlanks);
                if (match)
                {
                    // make sure no entries of a2 get used twice
                    let a2Clone = _.clone(a2);
                    a2Clone.splice(i, 1);
                    let subMatch = Util._compareAlgebrasRecursive(a1.slice(1), a2Clone, newBlanks);
                    if (subMatch)
                    {
                        _.assign(blanks, newBlanks);
                        return true;
                    }
                }
            }
            return false;
        }
        
        let keys1 = Object.keys(a1);
        let keys2 = Object.keys(a2);
        if (keys1.length !== keys2.length)
            return false;
        
        return keys1.every(key =>
        {
            if (a2[key] === undefined)
                return false;
            return Util._compareAlgebrasRecursive(a1[key], a2[key], blanks);
        });
    }

    // TODO: will need to be rewritten if new tests get added
    // static testString (algebra)
    // {
    //     if (algebra instanceof AlgebraElement)
    //     {
    //         let symbol = _.findKey(Algebra, val => val === algebra.symbol);
    //         symbol = symbol ? `A.${symbol}` : `'${algebra.symbol}'`;
    //         let args = algebra.args.map(Util.testString);
    //         return `AE(${symbol}, [ ${args.join(', ')} ])`;
    //     }
    //     else if (algebra instanceof Triple)
    //         return `T('${algebra.subject}', '${algebra.predicate}', '${algebra.object}')`;
    //     else if (algebra instanceof Array)
    //         return `[ ${algebra.map(Util.testString).join(', ')} ]`;
    //     else if (_.isString(algebra))
    //         return `'${algebra}'`;
    //     return algebra;
    // }
}

module.exports = Util;