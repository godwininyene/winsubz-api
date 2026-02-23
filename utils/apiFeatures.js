const { Op } = require('sequelize');

const{sequelize} = require('./../models');
const AppError = require('./appError');
class APIFeatures{
    constructor(queryString, modelName){
        this.queryString = queryString;
        this.modelName = modelName;
        this.queryOptions = {
            where:{},
            include:[],
            order:[],
            // limit:5,
            // offset:1,
        }
        this.paginationInfo={
            limit:15,
            page:1
        }
    }

    isDateString(value) {
        // Check if value is a valid date string
        return !isNaN(Date.parse(value));
    }

    filter(){
        // 1A) Filtering
        // Allowed Sequelize operators
        const allowedOps = ["eq", "ne", "gte", "lte", "gt", "lt", "like", "iLike", "between", "notBetween", "in", "notIn"];
        const queryObj = { ...this.queryString };
        const excludedFields = ["page", "sort", "limit", "fields", "search"];
        excludedFields.forEach((el) => delete queryObj[el]);
        
        // 1B) Advanced filtering
        let keys = Object.keys(queryObj);
        keys.forEach((key) => {
            const value = queryObj[key];

            // Filtering with operator (object case)
            if (typeof value === "object" && value !== null) {
                this.queryOptions.where[key] = {};
               
                
                Object.keys(value).forEach((operator) => {
                    if (allowedOps.includes(operator)) {
                        const rawVal = value[operator];
                        // Handle date values specially - don't convert to number
                        if (this.isDateString(rawVal)) {
                            
                            this.queryOptions.where[key][Op[operator]] = new Date(rawVal);
                        } else {
                            // Convert number if possible, otherwise keep as string
                            this.queryOptions.where[key][Op[operator]] = isNaN(rawVal) ? rawVal : Number(rawVal);
                        }
                    
                    }else{
                    
                        throw new AppError(`Invalid operator(${operator})`)
                    }
                });

            } else {
            // Simple equality
            this.queryOptions.where[key] = isNaN(value) ? value : Number(value);
            }
        });

        // Handle search with model-specific fields
        if (this.queryString.search) {
            const searchTerm = this.queryString.search; 
            const searchConditions = this.getSearchConditions(searchTerm);
           
            if (searchConditions.length > 0) { 
                this.queryOptions.where = {
                    ...this.queryOptions.where,
                    [Op.or]: searchConditions
                };
            }
        }

        return this
    }

    getSearchConditions(searchTerm) {
        //Define searchable fields for each model
        const modelSearchFields = {
            User: [
                { field: 'firstName', type: 'string' },
                { field: 'lastName', type: 'string' },
                { field: 'email', type: 'string' },
                { field: 'phone', type: 'string' },
            ],
            Transaction: [
                { field: 'ref', type: 'string' },
                { field: 'description', type: 'string' }
            ],
            VTUTransaction: [
                { field: 'providerRef', type: 'string' },
                { field: 'beneficiary', type: 'string' }
            ],
            Giftcard: [
                { field: 'cardName', type: 'string' },
            ],
            Coin: [
                { field: 'coinName', type: 'string' },
            ],
        };
    
        const searchConditions = [];
        const fields = modelSearchFields[this.modelName] || [];
        fields.forEach(({ field, type }) => {
            const qualifiedField = `${this.modelName}.${field}`; // Prefixed column name

            if (type === 'string') {
                searchConditions.push(
                    sequelize.where(
                        sequelize.fn('LOWER', sequelize.col(qualifiedField)),
                        { [Op.like]: `%${searchTerm.toLowerCase()}%` }
                    )
                );
            
            } else if (type === 'phone') {
                searchConditions.push({
                    [qualifiedField]: {
                        [Op.like]: `%${searchTerm}%`
                    }
                });
            } else if (type === 'number') {
                if (!isNaN(searchTerm)) {
                    searchConditions.push({
                        [qualifiedField]: Number(searchTerm)
                    });
                }
            }
        });
    
        return searchConditions;
    }

    sort(){
        if(this.queryString.sort){
        const sortBy = this.queryString.sort.split(',');
        this.queryOptions.order = sortBy.map(field=>{
            if(field.startsWith('-')){
                return[field.slice(1), 'DESC']
            }else{
                return [field, 'ASC']
            }
        })
        }else{
            this.queryOptions.order = [['createdAt', 'DESC']];
        }

        return this;
    }

    limitFields(){
        if(this.queryString.fields){
            const fields = this.queryString.fields.split(',');
            const includeFields = [];
            const excludeFields = [];
            
            fields.forEach(field => {
                if (field.startsWith('-')) {
                    excludeFields.push(field.slice(1));
                } else {
                    includeFields.push(field);
                }
            });
        
            // Set attributes based on whether we have includes or excludes
            if (includeFields.length > 0 && excludeFields.length > 0) {
                // If both include and exclude are specified, use include only
                // (Sequelize doesn't support both simultaneously in the same query)
                this.queryOptions.attributes = includeFields;
            } else if (includeFields.length > 0) {
                this.queryOptions.attributes = includeFields;
            } else if (excludeFields.length > 0) {
                this.queryOptions.attributes = { exclude: excludeFields };
            }
            
        }

        return this;
    }
    paginate(){
        const page = this.queryString?.page * 1 || this.paginationInfo.page;
        const limit = this.queryString?.limit * 1 || this.paginationInfo.limit
        const offset = (page -1 ) * limit
        this.queryOptions.offset = offset;
        this.queryOptions.limit = limit

        this.paginationInfo.limit = limit;
        this.paginationInfo.page = page
        return this;
    }

    getPaginationInfo(){
        return this.paginationInfo
    }

    getFeaures(){
        return this.queryOptions

    }
}

module.exports = APIFeatures;